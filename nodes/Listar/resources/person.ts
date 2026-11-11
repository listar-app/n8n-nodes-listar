import type { IDataObject, IExecuteFunctions, INodeProperties, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { finalBody, getResult, launchRequest, listarRequest, waitForResult } from '../transport';
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
			{
				name: 'Report Wrong Data',
				value: 'report',
				description:
					'Report a delivered phone or email as wrong: it is never delivered nor billed to you again for that person',
				action: 'Report wrong data on a person result',
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
			{
				name: 'LinkedIn Profile Only',
				value: 'none',
				description: 'URL, current job title and company, without any phone or email search',
			},
		],
		default: 'both',
		displayOptions: show(['enrich']),
		description:
			'Only the requested channel is delivered and billed. The LinkedIn profile (URL, current job title and company) comes free with a phone or email search.',
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
	{
		displayName: 'Result ID',
		name: 'reportedId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['report']),
		description:
			'The ID of the person result, or the ID of a row of a bulk enrichment (the ID of an item of its results)',
	},
	{
		displayName: 'Issues',
		name: 'reasons',
		type: 'multiOptions',
		required: true,
		default: [],
		displayOptions: show(['report']),
		description:
			"Every issue that applies. A phone or email reported as someone else's (or bounced) is never delivered nor billed to you again for that person, for a year.",
		options: [
			{
				name: 'Email Bounced',
				value: 'email_bounced',
				description: 'The email bounced when used',
			},
			{
				name: 'Left Company',
				value: 'left_company',
				description: 'The contact no longer works there (passed to the Listar team)',
			},
			{
				name: 'Outdated Info',
				value: 'outdated_info',
				description: 'Anything else out of date (passed to the Listar team)',
			},
			{
				name: 'Wrong Company',
				value: 'wrong_company',
				description: 'Another company than the one meant (passed to the Listar team)',
			},
			{
				name: 'Wrong Email',
				value: 'wrong_email',
				description: 'The email belongs to someone else',
			},
			{
				name: 'Wrong Person',
				value: 'wrong_person',
				description: 'The delivered profile is not the person searched',
			},
			{
				name: 'Wrong Phone',
				value: 'wrong_phone',
				description: 'The phone number belongs to someone else',
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'reportFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['report']),
		options: [
			{
				displayName: 'Comment',
				name: 'freeText',
				type: 'string',
				default: '',
				description: 'What was observed, e.g. the bounce message',
			},
			{
				displayName: 'Emails',
				name: 'emails',
				type: 'string',
				default: '',
				description:
					'The wrong emails, separated by commas. Empty: every email of the result is reported.',
			},
			{
				displayName: 'Phones',
				name: 'phones',
				type: 'string',
				default: '',
				description:
					'The wrong numbers, in any format, separated by commas. Empty: every number of the result is reported.',
			},
		],
	},
];

/** A comma-separated list, trimmed, empty entries dropped. */
const listOf = (value: unknown): string[] =>
	typeof value === 'string'
		? value
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean)
		: [];

/**
 * Reports wrong data on a person result or a bulk row. Free; the values are
 * withheld from every later delivery of the same person to this account.
 */
async function reportWrongData(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = (this.getNodeParameter('reportedId', itemIndex) as string).trim();
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'The result ID is empty', {
			itemIndex,
			description: 'Use the ID of the person result, or of the bulk row, to report.',
		});
	}
	const reasons = this.getNodeParameter('reasons', itemIndex) as string[];
	if (!reasons.length) {
		throw new NodeOperationError(this.getNode(), 'Select at least one issue', { itemIndex });
	}
	const fields = this.getNodeParameter('reportFields', itemIndex) as IDataObject;
	const phones = listOf(fields.phones);
	const emails = listOf(fields.emails);
	const freeText = typeof fields.freeText === 'string' ? fields.freeText.trim() : '';
	const response = await listarRequest.call(this, 'POST', '/search/feedback', {
		id,
		rating: 'negative',
		reasons,
		...(phones.length ? { phones } : {}),
		...(emails.length ? { emails } : {}),
		...(freeText ? { freeText } : {}),
	});
	// Rated by another call at the same moment, or a run without a paying
	// account: the generic 409 wording (another kind of search) would mislead.
	if (response.statusCode === 409) {
		const message = typeof response.body.message === 'string' ? response.body.message : 'Conflict';
		throw new NodeApiError(this.getNode(), response.body as JsonObject, {
			itemIndex,
			httpCode: '409',
			message: 'Listar could not save the report',
			description: message,
		});
	}
	finalBody.call(this, response, itemIndex);
	return { id, reported: true, reasons };
}

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
	if (operation === 'report') return reportWrongData.call(this, itemIndex);

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
	const linkedin = (result.linkedinProfile as IDataObject | undefined) ?? {};
	const phone = (result.bestPhone as IDataObject | undefined) ?? {};
	const email = (result.bestEmail as IDataObject | undefined) ?? {};
	return {
		id: result.id,
		status: 'completed',
		firstName: profile.firstName ?? null,
		lastName: profile.lastName ?? null,
		company: profile.company ?? null,
		jobTitle: profile.jobTitle ?? null,
		linkedinUrl: linkedin.url ?? profile.linkedinUrl ?? null,
		// LinkedIn profile channel: the position LinkedIn shows now.
		currentJobTitle: linkedin.jobTitle ?? null,
		currentCompany: linkedin.company ?? null,
		positionObservedAt: linkedin.observedAt ?? null,
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
