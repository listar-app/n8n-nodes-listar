import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getResult, launchRequest, waitForResult } from '../transport';
import { compact, resultId, resultIdField, simplifyField, waitFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['company'], operation } });
const searchBy = (value: string) => ({
	show: { resource: ['company'], operation: ['enrich'], companySearchBy: [value] },
});

const labels: Record<string, string> = {
	companyName: 'Company Name',
	domain: 'Domain',
	siren: 'SIREN',
	siret: 'SIRET',
};

export const companyOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['company'] } },
		options: [
			{
				name: 'Enrich',
				value: 'enrich',
				description: 'Get the company info and its decision makers',
				action: 'Get a company and its decision makers',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the result of a company enrichment launched earlier',
				action: 'Get the result of a company search',
			},
		],
		default: 'enrich',
	},
];

export const companyFields: INodeProperties[] = [
	{
		displayName: 'Search By',
		name: 'companySearchBy',
		type: 'options',
		options: [
			{
				name: 'Company Name',
				value: 'companyName',
				description: 'Add the city or the domain: a name alone can match several companies',
			},
			{
				name: 'Domain',
				value: 'domain',
				description: 'Website domain: the most reliable way to identify the company',
			},
			{ name: 'SIREN', value: 'siren', description: 'French company number (9 digits)' },
			{
				name: 'SIRET',
				value: 'siret',
				description: 'French establishment number (14 digits): the most precise anchor in France',
			},
		],
		default: 'companyName',
		displayOptions: show(['enrich']),
		description: 'What identifies the company. Add any other known detail in Additional Fields.',
	},
	{
		displayName: 'Company Name',
		name: 'companyName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: searchBy('companyName'),
		description: 'Add the city or the domain: a name alone can match several companies',
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. listar.fr',
		displayOptions: searchBy('domain'),
	},
	{
		displayName: 'SIREN',
		name: 'siren',
		type: 'string',
		required: true,
		default: '',
		displayOptions: searchBy('siren'),
	},
	{
		displayName: 'SIRET',
		name: 'siret',
		type: 'string',
		required: true,
		default: '',
		displayOptions: searchBy('siret'),
	},
	{
		displayName: 'Include Contacts',
		name: 'withContacts',
		type: 'boolean',
		default: true,
		displayOptions: show(['enrich']),
		description:
			'Whether to return the decision makers (name, job title, LinkedIn profile). Their phone and email come from the Person > Enrich operation.',
	},
	{
		displayName: 'Number of Contacts',
		name: 'contactsTargetCount',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 5,
		displayOptions: {
			show: { resource: ['company'], operation: ['enrich'], withContacts: [true] },
		},
		description: 'Each returned contact is billed',
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
				displayName: 'Company Name',
				name: 'companyName',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/companySearchBy': ['companyName'] } },
			},
			{
				displayName: 'Contact to Find',
				name: 'contactHint',
				type: 'string',
				default: '',
				placeholder: 'e.g. Jane Doe, or Head of Sales',
				description: 'A specific person (name and/or role) to return first if found',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'e.g. Germany',
				description: 'Required when the company is not French',
			},
			{
				displayName: 'Domain',
				name: 'domain',
				type: 'string',
				default: '',
				placeholder: 'e.g. listar.fr',
				displayOptions: { hide: { '/companySearchBy': ['domain'] } },
				description: 'Website domain: the most reliable way to identify the company',
			},
			{
				displayName: 'Job Titles to Target',
				name: 'hintTitles',
				type: 'string',
				default: '',
				placeholder: 'e.g. CFO, HR director',
				description:
					'Comma-separated roles to look for beyond the decision makers. Runs a deeper search: slower, and more contacts billed.',
			},
			{
				displayName: 'SIREN',
				name: 'siren',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/companySearchBy': ['siren'] } },
				description: 'French company number (9 digits)',
			},
			{
				displayName: 'SIRET',
				name: 'siret',
				type: 'string',
				default: '',
				displayOptions: { hide: { '/companySearchBy': ['siret'] } },
				description: 'French establishment number (14 digits): the most precise anchor in France',
			},
		],
	},
	...waitFields(show(['enrich'])),
	resultIdField(show(['getResult'])),
	simplifyField(show(['enrich', 'getResult'])),
];

const resultPath = (id: string) => `/company-enrichment/search/${encodeURIComponent(id)}`;

export async function executeCompany(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation === 'getResult') {
		const id = resultId.call(this, itemIndex);
		return getResult.call(this, resultPath(id), id, itemIndex);
	}

	const additionalFields = this.getNodeParameter('additionalFields', itemIndex) as IDataObject;
	const withContacts = this.getNodeParameter('withContacts', itemIndex) as boolean;
	const identifier = this.getNodeParameter('companySearchBy', itemIndex) as string;
	const body = compact({
		...additionalFields,
		[identifier]: this.getNodeParameter(identifier, itemIndex) as string,
	});
	if (!body[identifier]) {
		throw new NodeOperationError(this.getNode(), `${labels[identifier]} is empty`, {
			itemIndex,
		});
	}
	body.withContacts = withContacts;
	if (withContacts) {
		body.contactsTargetCount = this.getNodeParameter('contactsTargetCount', itemIndex);
	}

	const launched = await launchRequest.call(this, '/company-enrichment/search', body, itemIndex);
	const waitForCompletion = this.getNodeParameter('waitForCompletion', itemIndex) as boolean;
	const maxWait = waitForCompletion
		? (this.getNodeParameter('maxWaitSeconds', itemIndex) as number)
		: 0;
	return waitForResult.call(this, launched, resultPath, maxWait, itemIndex);
}

/** The essentials of a company result, contacts included. */
export const simplifyCompany = (response: IDataObject): IDataObject => {
	if (response.status === 'pending') return response;
	const result = (response.result as IDataObject | undefined) ?? {};
	const people = (list: unknown) =>
		((list as IDataObject[] | null | undefined) ?? []).map((person) => ({
			fullName: person.fullName ?? null,
			firstName: person.firstName ?? null,
			lastName: person.lastName ?? null,
			jobTitle: person.jobTitle ?? person.mandateRole ?? null,
			linkedinUrl: person.linkedinUrl ?? null,
		}));
	return {
		id: response.id,
		status: 'completed',
		companyName: result.companyName ?? null,
		domain: result.domain ?? null,
		website: result.website ?? null,
		siren: result.siren ?? null,
		siret: result.siret ?? null,
		industry: result.apeLabel ?? result.industry ?? null,
		employees: result.employees ?? null,
		address: result.address ?? null,
		city: result.city ?? null,
		postalCode: result.postalCode ?? null,
		country: result.country ?? null,
		phone: result.phone ?? null,
		linkedinUrl: result.linkedinUrl ?? null,
		// Set when the match is a branch rather than the head office, whose
		// address is the one above.
		establishmentSiret: result.establishmentSiret ?? null,
		establishmentAddress: result.establishmentAddress ?? null,
		establishmentCity: result.establishmentCity ?? null,
		establishmentPostalCode: result.establishmentPostalCode ?? null,
		// Legal representatives from the register, returned even without contacts.
		directors: people(result.directors),
		contacts: people(result.contacts),
	};
};
