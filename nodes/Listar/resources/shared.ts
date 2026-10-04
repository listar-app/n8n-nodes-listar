import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

/** "jane-doe" from a profile URL or a bare slug. */
export const linkedinSlug = (value: string): string => {
	const trimmed = value.trim();
	const match = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
	return decodeURIComponent(match ? match[1] : trimmed.replace(/^\/+|\/+$/g, ''));
};

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
