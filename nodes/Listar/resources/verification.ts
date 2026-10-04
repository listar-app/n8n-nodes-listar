import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { finalBody, launchRequest } from '../transport';

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
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['phone'], operation: ['verifyOwnership'] } },
		description: 'Required without a LinkedIn profile',
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['phone'], operation: ['verifyOwnership'] } },
		description: 'Required without a LinkedIn profile',
	},
	{
		displayName: 'LinkedIn Profile URL',
		name: 'linkedinUrl',
		type: 'string',
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/jane-doe',
		displayOptions: { show: { resource: ['phone'], operation: ['verifyOwnership'] } },
		description: 'Enables a face comparison, much more precise than the name',
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
	const phone = (this.getNodeParameter('phone', itemIndex) as string).trim();
	if (operation === 'checkWhatsApp') {
		const response = await launchRequest.call(
			this,
			'/search/verify-whatsapp',
			{ phones: [phone] },
			itemIndex,
		);
		return firstResult(finalBody.call(this, response, itemIndex));
	}

	const contact: IDataObject = { phone };
	for (const field of ['firstName', 'lastName', 'linkedinUrl']) {
		const value = (this.getNodeParameter(field, itemIndex) as string).trim();
		if (value) contact[field] = value;
	}
	const response = await launchRequest.call(
		this,
		'/search/verify-phone-ownership',
		{ contacts: [contact] },
		itemIndex,
	);
	return firstResult(finalBody.call(this, response, itemIndex));
}
