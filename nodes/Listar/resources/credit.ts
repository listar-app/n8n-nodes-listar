import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { finalBody, listarRequest } from '../transport';

export const creditOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['credit'] } },
		options: [
			{
				name: 'Get Balance',
				value: 'getBalance',
				description: 'Get the remaining Listar credit',
				action: 'Get the remaining credit balance',
			},
		],
		default: 'getBalance',
	},
];

export async function executeCredit(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const response = await listarRequest.call(this, 'GET', '/credit/balance');
	return finalBody.call(this, response, itemIndex);
}
