import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	companyFields,
	companyOperations,
	executeCompany,
	simplifyCompany,
} from './resources/company';
import { creditOperations, executeCredit } from './resources/credit';
import { executePerson, personFields, personOperations, simplifyPerson } from './resources/person';
import {
	emailOperations,
	executeEmail,
	executePhone,
	phoneOperations,
	verificationFields,
} from './resources/verification';

export class Listar implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Listar',
		name: 'listar',
		icon: { light: 'file:../../icons/listar.svg', dark: 'file:../../icons/listar.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Find phone numbers, emails and decision makers with Listar',
		defaults: {
			name: 'Listar',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'listarApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Credit', value: 'credit' },
					{ name: 'Email', value: 'email' },
					{ name: 'Person', value: 'person' },
					{ name: 'Phone', value: 'phone' },
				],
				default: 'person',
			},
			...personOperations,
			...companyOperations,
			...emailOperations,
			...phoneOperations,
			...creditOperations,
			...personFields,
			...companyFields,
			...verificationFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				let result: IDataObject;

				if (resource === 'person') {
					result = await executePerson.call(this, operation, itemIndex);
					if (this.getNodeParameter('simplify', itemIndex) as boolean) {
						result = simplifyPerson(result);
					}
				} else if (resource === 'company') {
					result = await executeCompany.call(this, operation, itemIndex);
					if (this.getNodeParameter('simplify', itemIndex) as boolean) {
						result = simplifyCompany(result);
					}
				} else if (resource === 'email') {
					result = await executeEmail.call(this, itemIndex);
				} else if (resource === 'phone') {
					result = await executePhone.call(this, operation, itemIndex);
				} else if (resource === 'credit') {
					result = await executeCredit.call(this, itemIndex);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The resource "${resource}" is not supported`,
						{
							itemIndex,
						},
					);
				}

				returnData.push({ json: result, pairedItem: { item: itemIndex } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				// Both constructors hand back an error of their own type unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
