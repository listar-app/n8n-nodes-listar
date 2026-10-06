import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { finalBody, launchRequest } from '../transport';
import { compact } from './shared';

export const emailOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['email'] } },
		options: [
			{
				name: 'Verify',
				value: 'verify',
				description: 'Check whether an email address can receive mail',
				action: 'Check whether an email can receive mail',
			},
		],
		default: 'verify',
	},
];

export const phoneOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['phone'] } },
		options: [
			{
				name: 'Check WhatsApp',
				value: 'checkWhatsApp',
				description: 'Check whether a phone number has a WhatsApp account',
				// Lowercased on purpose: n8n's scanner enforces sentence case on actions
				// and ignores eslint-disable comments.
				action: 'Check a phone for a whatsapp account',
			},
			{
				name: 'Verify Ownership',
				value: 'verifyOwnership',
				description: 'Check whether a phone number belongs to a given person',
				action: 'Check whether a phone belongs to a person',
			},
		],
		default: 'verifyOwnership',
	},
];

const ownership = (checkAgainst?: string) => ({
	show: {
		resource: ['phone'],
		operation: ['verifyOwnership'],
		...(checkAgainst ? { checkAgainst: [checkAgainst] } : {}),
	},
});

/** The required fields of each "Check Against" choice. */
const owners: Record<string, string[]> = {
	name: ['firstName', 'lastName'],
	linkedin: ['linkedinUrl'],
};

const labels: Record<string, string> = {
	firstName: 'First Name',
	lastName: 'Last Name',
	linkedinUrl: 'LinkedIn Profile URL',
};

/**
 * "+33612345678" from a number typed with separators ("+33 6 12 34 56 78",
 * "+1 (415) 555-0100") or a "00" international prefix: the API only takes
 * the compact international format.
 */
const internationalPhone = (value: string): string =>
	value.replace(/[\s.()/-]/g, '').replace(/^00/, '+');

export const verificationFields: INodeProperties[] = [
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['email'], operation: ['verify'] } },
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +33612345678',
		displayOptions: { show: { resource: ['phone'] } },
		description: 'Phone number in international format',
	},
	{
		displayName: 'Check Against',
		name: 'checkAgainst',
		type: 'options',
		options: [
			{ name: 'Name', value: 'name', description: 'First and last name of the expected owner' },
			{
				name: 'LinkedIn Profile',
				value: 'linkedin',
				description: 'Enables a face comparison, much more precise than the name',
			},
		],
		default: 'name',
		displayOptions: ownership(),
		description: 'Who the phone number should belong to',
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: ownership('name'),
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: ownership('name'),
	},
	{
		displayName: 'LinkedIn Profile URL',
		name: 'linkedinUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/jane-doe',
		displayOptions: ownership('linkedin'),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: ownership(),
		options: [
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/checkAgainst': ['name'] } },
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/checkAgainst': ['name'] } },
			},
			{
				displayName: 'LinkedIn Profile URL',
				name: 'linkedinUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://www.linkedin.com/in/jane-doe',
				displayOptions: { hide: { '/checkAgainst': ['linkedin'] } },
				description: 'Enables a face comparison, much more precise than the name',
			},
		],
	},
];

/** The single verdict of a one-entry verification request, with its cost. */
const firstResult = (body: IDataObject): IDataObject => {
	const [result] = (body.results as IDataObject[] | undefined) ?? [];
	return {
		...(result ?? {}),
		creditDeductedCents: body.creditDeducted ?? 0,
		creditRefundedCents: body.creditRefunded ?? 0,
	};
};

export async function executeEmail(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const email = (this.getNodeParameter('email', itemIndex) as string).trim();
	const response = await launchRequest.call(
		this,
		'/search/verify-emails',
		{ emails: [email] },
		itemIndex,
	);
	return firstResult(finalBody.call(this, response, itemIndex));
}

export async function executePhone(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	const phone = internationalPhone(this.getNodeParameter('phone', itemIndex) as string);
	if (operation === 'checkWhatsApp') {
		const response = await launchRequest.call(
			this,
			'/search/verify-whatsapp',
			{ phones: [phone] },
			itemIndex,
		);
		return firstResult(finalBody.call(this, response, itemIndex));
	}

	const required = owners[this.getNodeParameter('checkAgainst', itemIndex) as string] ?? [];
	const contact = compact({
		...(this.getNodeParameter('additionalFields', itemIndex) as IDataObject),
		...Object.fromEntries(
			required.map((name) => [name, this.getNodeParameter(name, itemIndex) as string]),
		),
		phone,
	});
	const missing = required.find((name) => !contact[name]);
	if (missing) {
		throw new NodeOperationError(this.getNode(), `${labels[missing]} is empty`, {
			itemIndex,
		});
	}
	const response = await launchRequest.call(
		this,
		'/search/verify-phone-ownership',
		{ contacts: [contact] },
		itemIndex,
	);
	return firstResult(finalBody.call(this, response, itemIndex));
}
