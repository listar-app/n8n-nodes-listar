import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { getResult, launchRequest, waitForResult } from '../transport';
import { resultId, resultIdField, simplifyField, waitFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['peopleSearch'], operation } });

const SENIORITIES = ['Owner', 'C-Level', 'VP', 'Director', 'Head', 'Manager', 'Senior'];

export const peopleSearchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['peopleSearch'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				description:
					'Find the people who hold a role, without knowing their company, including who just took the job',
				action: 'Find people by role',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the result of a people search launched earlier',
				action: 'Get the result of a people search',
			},
		],
		default: 'search',
	},
];

export const peopleSearchFields: INodeProperties[] = [
	{
		displayName: 'Brief',
		name: 'brief',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Heads of sales who took their job in France over the last 2 months',
		displayOptions: show(['search']),
		description:
			'Who you are looking for, in plain words. A judge reads it to keep only the people who really hold the role.',
	},
	{
		displayName: 'Job Titles',
		name: 'titles',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. head of sales, sales director, directeur commercial, directrice commerciale',
		displayOptions: show(['search']),
		description:
			'Comma-separated forms of the title. Each one is matched as whole words, with no gender folding and no translation: list the French and English forms, both genders and the acronyms.',
	},
	{
		displayName: 'Countries',
		name: 'countries',
		type: 'string',
		required: true,
		default: 'France',
		displayOptions: show(['search']),
		description:
			'Comma-separated countries where the people are, checked on every person. Narrow to cities in Additional Fields.',
	},
	{
		displayName: 'Started Within (Days)',
		name: 'startedWithinDays',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 365, numberPrecision: 0 },
		default: 0,
		displayOptions: show(['search']),
		description:
			'Only the people who took their current job at most this many days ago (60 for the last 2 months). 0 keeps everyone. Start dates are known to the month.',
	},
	{
		displayName: 'Number of People',
		name: 'target',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 500, numberPrecision: 0 },
		default: 50,
		displayOptions: show(['search']),
		description: 'Each person delivered is billed; a search that finds nobody costs nothing',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['search']),
		options: [
			{
				displayName: 'Cities',
				name: 'cities',
				type: 'string',
				default: '',
				placeholder: 'e.g. Lyon, Grenoble',
				description: 'Comma-separated cities to narrow the search to, within the countries',
			},
			{
				displayName: 'Exclude Titles',
				name: 'excludeTitles',
				type: 'string',
				default: '',
				placeholder: 'e.g. assistant, assistante, intern',
				description: 'Comma-separated words that rule a title out',
			},
			{
				displayName: 'Industries',
				name: 'industries',
				type: 'string',
				default: '',
				placeholder: 'e.g. Software Development',
				description: 'Comma-separated industries of their current company, in English',
			},
			{
				displayName: 'Max Company Headcount',
				name: 'employeesMax',
				type: 'number',
				typeOptions: { minValue: 1, numberPrecision: 0 },
				default: 1000,
			},
			{
				displayName: 'Min Company Headcount',
				name: 'employeesMin',
				type: 'number',
				typeOptions: { minValue: 0, numberPrecision: 0 },
				default: 10,
			},
			{
				displayName: 'Seniority',
				name: 'seniorities',
				type: 'multiOptions',
				options: SENIORITIES.map((level) => ({ name: level, value: level })),
				default: [],
				description: 'Levels to keep. Leave empty unless the role implies one.',
			},
		],
	},
	...waitFields(show(['search'])),
	resultIdField(show(['getResult'])),
	simplifyField(show(['search', 'getResult'])),
];

const resultPath = (id: string) => `/people-search/${encodeURIComponent(id)}`;

/**
 * Comma-separated text, or an array from an expression (or from an AI agent
 * using the node as a tool). Fragments shorter than 2 characters are noise the
 * API refuses.
 */
const list = (value: unknown): string[] =>
	(Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : [])
		.map((part) => part.trim())
		.filter((part) => part.length >= 2);

export async function executePeopleSearch(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation === 'getResult') {
		const id = resultId.call(this, itemIndex);
		return getResult.call(this, resultPath(id), id, itemIndex);
	}

	const additionalFields = this.getNodeParameter('additionalFields', itemIndex) as IDataObject;
	const titles = list(this.getNodeParameter('titles', itemIndex));
	if (titles.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Job Titles is empty', { itemIndex });
	}
	const countries = list(this.getNodeParameter('countries', itemIndex));
	if (countries.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Countries is empty', {
			itemIndex,
			description: 'A search with no country matches the whole world.',
		});
	}
	const cities = list(additionalFields.cities);
	const startedWithinDays = Math.round(
		this.getNodeParameter('startedWithinDays', itemIndex) as number,
	);
	const excludeTitles = list(additionalFields.excludeTitles);
	const industries = list(additionalFields.industries);
	const seniorities = (additionalFields.seniorities as string[] | undefined) ?? [];

	const criteria: IDataObject = {
		titles,
		countries,
		...(cities.length ? { cities } : {}),
		...(startedWithinDays > 0 ? { startedWithinDays } : {}),
		...(excludeTitles.length ? { excludeTitles } : {}),
		...(industries.length ? { industries } : {}),
		...(seniorities.length ? { seniorities } : {}),
		...(typeof additionalFields.employeesMin === 'number'
			? { employeesMin: Math.round(additionalFields.employeesMin) }
			: {}),
		...(typeof additionalFields.employeesMax === 'number'
			? { employeesMax: Math.round(additionalFields.employeesMax) }
			: {}),
	};

	const launched = await launchRequest.call(
		this,
		'/people-search',
		{
			brief: (this.getNodeParameter('brief', itemIndex) as string).trim(),
			criteria,
			target: Math.round(this.getNodeParameter('target', itemIndex) as number),
		},
		itemIndex,
		{ retryBusyAccount: false },
	);
	const waitForCompletion = this.getNodeParameter('waitForCompletion', itemIndex) as boolean;
	const maxWait = waitForCompletion
		? (this.getNodeParameter('maxWaitSeconds', itemIndex) as number)
		: 0;
	return waitForResult.call(this, launched, resultPath, maxWait, itemIndex);
}

/** The essentials of a people search: who, and the list they are saved in. */
export const simplifyPeopleSearch = (response: IDataObject): IDataObject => {
	if (response.status === 'pending') return response;
	const people = ((response.people as IDataObject[] | undefined) ?? []).map((person) => ({
		fullName: person.fullName ?? null,
		firstName: person.firstName ?? null,
		lastName: person.lastName ?? null,
		title: person.title ?? null,
		company: person.company ?? null,
		companyDomain: person.companyDomain ?? null,
		city: person.city ?? null,
		country: person.country ?? null,
		startedAt: person.startedAt ?? null,
		linkedinUrl: person.linkedinUrl ?? null,
	}));
	return {
		id: response.id,
		status: 'completed',
		delivered: response.delivered ?? people.length,
		totalAvailable: response.totalAvailable ?? null,
		listId: response.listId ?? null,
		costCents: response.costCents ?? null,
		// Why it stopped: only `exhausted` means there is nobody else. With
		// `sourceFailed`, the list is short because of Listar: run it again
		// later rather than widening the search.
		exhausted: response.exhausted ?? null,
		stopReason: response.stopReason ?? null,
		sourceFailed: response.sourceFailed === true,
		people,
	};
};
