import type {
	IDataObject,
	IDisplayOptions,
	IExecuteFunctions,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const safeDecode = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

/**
 * "jane-doe" from a profile URL (`linkedin.com/in/jane-doe`, `.../mwlite/in/jane-doe`,
 * `in/jane-doe`) or a bare slug. Any other LinkedIn link (Sales Navigator lead,
 * company page, old `/pub/` profile) is refused rather than sent as a slug,
 * which would launch a billed search on a meaningless identifier.
 */
export function linkedinSlug(this: IExecuteFunctions, value: string, itemIndex: number): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	const match = trimmed.match(/(?:^|\/)in\/([^/?#]+)/i);
	const slug = safeDecode(match ? match[1] : trimmed.replace(/^\/+|\/+$/g, '')).trim();
	if (!match && (/linkedin\./i.test(slug) || slug.includes('/'))) {
		throw new NodeOperationError(
			this.getNode(),
			'The LinkedIn profile must be a profile URL (linkedin.com/in/...) or its slug',
			{ itemIndex, description: `Received: ${trimmed}` },
		);
	}
	return slug;
}

/** Trimmed strings, empty ones dropped; other values kept as they are. */
export const compact = (fields: IDataObject): IDataObject =>
	Object.fromEntries(
		Object.entries(fields)
			.map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
			.filter(([, value]) => value !== ''),
	);

/** The "Get Result" search ID, trimmed; an empty one is refused. */
export function resultId(this: IExecuteFunctions, itemIndex: number): string {
	const id = (this.getNodeParameter('resultId', itemIndex) as string).trim();
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'The search ID is empty', {
			itemIndex,
			description: 'Use the ID returned when the search was launched.',
		});
	}
	return id;
}

export const waitFields = (displayOptions: IDisplayOptions): INodeProperties[] => [
	{
		displayName: 'Wait for Result',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		displayOptions,
		description:
			'Whether to wait for the search to complete. When off, or when the wait runs out, the item holds the search ID to fetch later with "Get Result".',
	},
	{
		displayName: 'Max Wait (Seconds)',
		name: 'maxWaitSeconds',
		type: 'number',
		typeOptions: { minValue: 10, maxValue: 900 },
		default: 180,
		displayOptions: {
			...displayOptions,
			show: { ...displayOptions.show, waitForCompletion: [true] },
		},
		description: 'Most searches complete within a minute, some take a few minutes',
	},
];

export const resultIdField = (displayOptions: IDisplayOptions): INodeProperties => ({
	displayName: 'Search ID',
	name: 'resultId',
	type: 'string',
	required: true,
	default: '',
	displayOptions,
	description: 'The ID returned when the search was launched',
});

export const simplifyField = (displayOptions: IDisplayOptions): INodeProperties => ({
	displayName: 'Simplify',
	name: 'simplify',
	type: 'boolean',
	default: true,
	displayOptions,
	description: 'Whether to return a simplified version of the response instead of the raw data',
});
