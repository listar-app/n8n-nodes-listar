import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { getResult, listarRequest, waitForResult } from '../transport';
import { linkedinSlug, waitFields, resultIdField, simplifyField } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['person'], operation } });

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
				action: 'Enrich a person',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the result of a person enrichment launched earlier',
				action: 'Get a person enrichment result',
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
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		default: '',
		displayOptions: show(['enrich']),
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		default: '',
		displayOptions: show(['enrich']),
	},
	{
		displayName: 'Company',
		name: 'company',
		type: 'string',
		default: '',
		displayOptions: show(['enrich']),
		description: 'Current company of the person',
	},
	{
		displayName: 'LinkedIn Profile',
		name: 'linkedin',
		type: 'string',
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/jane-doe',
		displayOptions: show(['enrich']),
		description: 'Profile URL or slug: the strongest identifier of the person',
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
				description: 'A known email of the person, to find their phone number',
			},
			{
				displayName: 'Job Title',
				name: 'jobTitle',
				type: 'string',
				default: '',
				description: 'Used to tell the person apart from namesakes',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
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

const compact = (fields: IDataObject): IDataObject =>
	Object.fromEntries(
		Object.entries(fields).filter(([, value]) => typeof value !== 'string' || value.trim() !== ''),
	);

export async function executePerson(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation === 'getResult') {
		const id = this.getNodeParameter('resultId', itemIndex) as string;
		return getResult.call(this, resultPath(id), id, itemIndex);
	}

	const additionalFields = this.getNodeParameter('additionalFields', itemIndex) as IDataObject;
	const body = compact({
		firstName: this.getNodeParameter('firstName', itemIndex) as string,
		lastName: this.getNodeParameter('lastName', itemIndex) as string,
		company: this.getNodeParameter('company', itemIndex) as string,
		linkedinSlug: linkedinSlug(this.getNodeParameter('linkedin', itemIndex) as string),
		...additionalFields,
	});
	body.enrichmentType = this.getNodeParameter('enrichmentType', itemIndex);
	// Launched without holding the response, then polled: the search ID comes
	// back at once, so a slow search is never lost (and paid for twice).
	body.respondAsync = true;

	const launched = await listarRequest.call(this, 'POST', '/search/unified', body);
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
		creditDeductedCents: result.creditDeducted ?? 0,
	};
};
