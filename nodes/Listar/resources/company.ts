import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getResult, listarRequest, waitForResult } from '../transport';
import { resultIdField, simplifyField, waitFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['company'], operation } });

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
				action: 'Enrich a company',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the result of a company enrichment launched earlier',
				action: 'Get a company enrichment result',
			},
		],
		default: 'enrich',
	},
];

export const companyFields: INodeProperties[] = [
	{
		displayName: 'Company Name',
		name: 'companyName',
		type: 'string',
		default: '',
		displayOptions: show(['enrich']),
		description: 'Add the city or the domain: a name alone can match several companies',
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		default: '',
		placeholder: 'e.g. listar.fr',
		displayOptions: show(['enrich']),
		description: 'Website domain: the most reliable way to identify the company',
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
				description: 'French company number (9 digits)',
			},
			{
				displayName: 'SIRET',
				name: 'siret',
				type: 'string',
				default: '',
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
		const id = this.getNodeParameter('resultId', itemIndex) as string;
		return getResult.call(this, resultPath(id), id, itemIndex);
	}

	const additionalFields = this.getNodeParameter('additionalFields', itemIndex) as IDataObject;
	const withContacts = this.getNodeParameter('withContacts', itemIndex) as boolean;
	const body: IDataObject = Object.fromEntries(
		Object.entries({
			companyName: this.getNodeParameter('companyName', itemIndex) as string,
			domain: this.getNodeParameter('domain', itemIndex) as string,
			...additionalFields,
		}).filter(([, value]) => typeof value !== 'string' || value.trim() !== ''),
	);
	if (!body.companyName && !body.domain && !body.siren && !body.siret) {
		throw new NodeOperationError(
			this.getNode(),
			'Give the company name, its domain, its SIREN or its SIRET',
			{ itemIndex },
		);
	}
	body.withContacts = withContacts;
	if (withContacts) {
		body.contactsTargetCount = this.getNodeParameter('contactsTargetCount', itemIndex);
	}

	const launched = await listarRequest.call(this, 'POST', '/company-enrichment/search', body);
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
	const contacts = ((result.contacts as IDataObject[] | null | undefined) ?? []).map((contact) => ({
		fullName: contact.fullName ?? null,
		firstName: contact.firstName ?? null,
		lastName: contact.lastName ?? null,
		jobTitle: contact.jobTitle ?? contact.mandateRole ?? null,
		linkedinUrl: contact.linkedinUrl ?? null,
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
		contacts,
	};
};
