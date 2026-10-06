import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getResult, launchRequest, waitForResult } from '../transport';
import {
	compact,
	linkedinSlug,
	resultId,
	resultIdField,
	simplifyField,
	waitFields,
} from './shared';

const show = (operation: string[]) => ({ show: { resource: ['person'], operation } });
const searchBy = (value: string) => ({
	show: { resource: ['person'], operation: ['enrich'], searchBy: [value] },
});

/** The required fields of each "Search By" choice. */
const identifiers: Record<string, string[]> = {
	name: ['firstName', 'lastName'],
	linkedin: ['linkedin'],
	email: ['email'],
	phone: ['phone'],
};

const labels: Record<string, string> = {
	firstName: 'First Name',
	lastName: 'Last Name',
	linkedin: 'LinkedIn Profile',
	email: 'Email',
	phone: 'Phone',
};

export const personOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['person'] } },
		options: [
			{
				name: 'Enrich',
				value: 'enrich',
				description: 'Find the phone number and email of a person',
				action: 'Find the phone number and email of a person',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the result of a person enrichment launched earlier',
				action: 'Get the result of a person search',
			},
		],
		default: 'enrich',
	},
];

export const personFields: INodeProperties[] = [
	{
		displayName: 'Data to Find',
		name: 'enrichmentType',
		type: 'options',
		options: [
			{ name: 'Phone and Email', value: 'both' },
			{ name: 'Phone Only', value: 'phone' },
			{ name: 'Email Only', value: 'email' },
		],
		default: 'both',
		displayOptions: show(['enrich']),
		description: 'Only the requested channel is delivered and billed',
	},
	{
		displayName: 'Search By',
		name: 'searchBy',
		type: 'options',
		options: [
			{ name: 'Name', value: 'name', description: 'First and last name of the person' },
			{
				name: 'LinkedIn Profile',
				value: 'linkedin',
				description: 'The strongest identifier of the person',
			},
			{ name: 'Email', value: 'email', description: 'A known email, to find the phone number' },
			{ name: 'Phone', value: 'phone', description: 'A known phone number, to find the email' },
		],
		default: 'name',
		displayOptions: show(['enrich']),
		description: 'What identifies the person. Add any other known detail in Additional Fields.',
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: searchBy('name'),
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: searchBy('name'),
	},
	{
		displayName: 'LinkedIn Profile',
		name: 'linkedin',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/jane-doe',
		displayOptions: searchBy('linkedin'),
		description: 'Profile URL or slug',
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		placeholder: 'name@email.com',
		default: '',
		displayOptions: searchBy('email'),
		description: 'A known email of the person',
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +33612345678',
		displayOptions: searchBy('phone'),
		description: 'A known phone number of the person',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['enrich']),
		options: [
			{
				displayName: 'City',
				name: 'city',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Company',
				name: 'company',
				type: 'string',
				default: '',
				description: 'Current company of the person: strongly recommended with a name',
			},
			{
				displayName: 'Company Website',
				name: 'website',
				type: 'string',
				default: '',
				placeholder: 'e.g. listar.fr',
				description: 'Its domain backs up professional emails',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'e.g. France',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				displayOptions: { hide: { '/searchBy': ['email'] } },
				description: 'A known email of the person, to find their phone number',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/searchBy': ['name'] } },
			},
			{
				displayName: 'Job Title',
				name: 'jobTitle',
				type: 'string',
				default: '',
				description: 'Used to tell the person apart from namesakes',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/searchBy': ['name'] } },
			},
			{
				displayName: 'LinkedIn Profile',
				name: 'linkedin',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://www.linkedin.com/in/jane-doe',
				displayOptions: { hide: { '/searchBy': ['linkedin'] } },
				description: 'Profile URL or slug: the strongest identifier of the person',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/searchBy': ['phone'] } },
				description: 'A known phone number of the person, to find their email',
			},
			{
				displayName: 'Postal Code',
				name: 'postalCode',
				type: 'string',
				default: '',
			},
		],
	},
	...waitFields(show(['enrich'])),
	resultIdField(show(['getResult'])),
	simplifyField(show(['enrich', 'getResult'])),
];

const resultPath = (id: string) => `/search/results/${encodeURIComponent(id)}`;

export async function executePerson(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation === 'getResult') {
		const id = resultId.call(this, itemIndex);
		return getResult.call(this, resultPath(id), id, itemIndex);
	}

	const additionalFields = this.getNodeParameter('additionalFields', itemIndex) as IDataObject;
	const required = identifiers[this.getNodeParameter('searchBy', itemIndex) as string] ?? [];
	const fields = compact({
		...additionalFields,
		...Object.fromEntries(
			required.map((name) => [name, this.getNodeParameter(name, itemIndex) as string]),
		),
	});
	const missing = required.find((name) => !fields[name]);
	if (missing) {
		throw new NodeOperationError(this.getNode(), `${labels[missing]} is empty`, {
			itemIndex,
		});
	}
	const { linkedin, ...body } = fields;
	if (linkedin) body.linkedinSlug = linkedinSlug.call(this, linkedin as string, itemIndex);
	body.enrichmentType = this.getNodeParameter('enrichmentType', itemIndex);
	// Launched without holding the response, then polled: the search ID comes
	// back at once, so a slow search is never lost (and paid for twice).
	body.respondAsync = true;

	const launched = await launchRequest.call(this, '/search/unified', body, itemIndex);
	const waitForCompletion = this.getNodeParameter('waitForCompletion', itemIndex) as boolean;
	const maxWait = waitForCompletion
		? (this.getNodeParameter('maxWaitSeconds', itemIndex) as number)
		: 0;
	return waitForResult.call(this, launched, resultPath, maxWait, itemIndex);
}

/** The essentials of a person result, flat. */
export const simplifyPerson = (result: IDataObject): IDataObject => {
	if (result.status === 'pending') return result;
	const profile = ((result.profiles as IDataObject[] | undefined) ?? [])[0] ?? {};
	const phone = (result.bestPhone as IDataObject | undefined) ?? {};
	const email = (result.bestEmail as IDataObject | undefined) ?? {};
	return {
		id: result.id,
		status: 'completed',
		firstName: profile.firstName ?? null,
		lastName: profile.lastName ?? null,
		company: profile.company ?? null,
		jobTitle: profile.jobTitle ?? null,
		linkedinUrl: profile.linkedinUrl ?? null,
		phone: phone.number ?? null,
		phoneType: phone.type ?? null,
		phoneUsage: phone.usage ?? null,
		phoneVerified: phone.verified ?? null,
		phoneIsWhatsApp: phone.isWhatsApp ?? null,
		email: email.address ?? null,
		emailStatus: email.verified ?? null,
		emailType: email.type ?? null,
		// The email's domain matches neither the company nor its official domain:
		// check it before prospecting.
		emailDomainUncorroborated: email.domainUncorroborated ?? null,
		emailStale: email.stale ?? null,
		creditDeductedCents: result.creditDeducted ?? 0,
	};
};
