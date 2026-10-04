import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ListarApi implements ICredentialType {
	name = 'listarApi';

	displayName = 'Listar API';

	icon: Icon = { light: 'file:../icons/listar.svg', dark: 'file:../icons/listar.dark.svg' };

	documentationUrl = 'https://github.com/listar-app/n8n-nodes-listar#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'e.g. sk_live_...',
			description: 'Create a key in the Listar app, under Settings > API keys',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.listar.fr',
			url: '/credit/balance',
			method: 'GET',
		},
	};
}
