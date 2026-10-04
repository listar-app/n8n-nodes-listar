import type { IDataObject, IExecuteFunctions, IHttpRequestMethods, JsonObject } from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export const BASE_URL = 'https://api.listar.fr';

const POLL_INTERVAL_MS = 5000;

export type ListarResponse = { statusCode: number; body: IDataObject };

/** 202 (still running) and 425 (ready, payment being settled) both mean "poll again". */
const isPending = (statusCode: number) => statusCode === 202 || statusCode === 425;

/** Calls the Listar API and returns the status with the body, whatever the status. */
export async function listarRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<ListarResponse> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'listarApi', {
		method,
		baseURL: BASE_URL,
		url: path,
		body,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as { statusCode: number; body: IDataObject | string | undefined };

	const responseBody =
		typeof response.body === 'object' && response.body !== null
			? response.body
			: { message: response.body ?? '' };
	return { statusCode: response.statusCode, body: responseBody };
}

/**
 * Turns a final answer into the item to output, or throws a readable error.
 * A 402 means the Listar credit does not cover the request: nothing was
 * delivered, and a result already found is settled automatically after a
 * top-up (then fetch it with the "Get Result" operation).
 */
export function finalBody(
	this: IExecuteFunctions,
	response: ListarResponse,
	itemIndex: number,
): IDataObject {
	const { statusCode, body } = response;
	if (statusCode >= 200 && statusCode < 300) return body;

	const apiMessage = typeof body.message === 'string' ? body.message : undefined;
	const byStatus: Record<number, { message: string; description: string }> = {
		400: {
			message: 'Listar rejected the request parameters',
			description: apiMessage ?? 'Check the fields of this item.',
		},
		401: {
			message: 'The Listar API key was refused',
			description:
				'Check the API key in the Listar credentials, or create a new one in the Listar app.',
		},
		402: {
			message: 'The Listar credit does not cover this request',
			description:
				'Nothing was delivered. Top up your Listar credit in the app. A result already found is settled automatically after the top-up and can then be fetched with the "Get Result" operation' +
				(typeof body.id === 'string' ? ` (ID ${body.id}).` : '.'),
		},
		404: {
			message: 'Listar does not know this ID',
			description: 'Check the ID: it must come from a search launched with the same API key.',
		},
		409: {
			message: 'This ID belongs to the other kind of search',
			description: 'Use the "Get Result" operation of the other resource (Person or Company).',
		},
		422: {
			message: 'The Listar search ended without a result',
			description: apiMessage ?? 'Retrying it as is will not help.',
		},
		429: {
			message: 'Too many requests sent to Listar',
			description: 'Wait a minute, or lower the number of items processed at once.',
		},
	};
	const known = byStatus[statusCode];
	throw new NodeApiError(this.getNode(), body as JsonObject, {
		itemIndex,
		httpCode: String(statusCode),
		message: known?.message ?? `Listar answered with HTTP ${statusCode}`,
		description: known?.description ?? apiMessage,
	});
}

/**
 * Polls a launched search until it is final or `maxWaitSeconds` runs out. A
 * search still running at the deadline comes back as `{ status: 'pending', id }`
 * rather than an error: it keeps running and is billed once, when it
 * completes, so the "Get Result" operation can collect it later.
 */
export async function waitForResult(
	this: IExecuteFunctions,
	launched: ListarResponse,
	resultPath: (id: string) => string,
	maxWaitSeconds: number,
	itemIndex: number,
): Promise<IDataObject> {
	const launchedId = launched.body.id ?? launched.body.searchResultId;
	const id = typeof launchedId === 'string' ? launchedId : undefined;
	if (!isPending(launched.statusCode) || !id) {
		return withId(finalBody.call(this, launched, itemIndex), id);
	}

	const deadline = Date.now() + maxWaitSeconds * 1000;
	while (Date.now() + POLL_INTERVAL_MS <= deadline) {
		await sleep(POLL_INTERVAL_MS);
		const polled = await listarRequest.call(this, 'GET', resultPath(id));
		if (!isPending(polled.statusCode)) {
			return withId(finalBody.call(this, polled, itemIndex), id);
		}
	}
	return pending(id);
}

export const pending = (id: string): IDataObject => ({
	status: 'pending',
	id,
	message:
		'Still running. Fetch it later with the "Get Result" operation and this ID. It is billed once, when it completes.',
});

/** Fetches a search once: its result, or `pending` while it still runs. */
export async function getResult(
	this: IExecuteFunctions,
	path: string,
	id: string,
	itemIndex: number,
): Promise<IDataObject> {
	const response = await listarRequest.call(this, 'GET', path);
	if (isPending(response.statusCode)) return pending(id);
	return withId(finalBody.call(this, response, itemIndex), id);
}

const withId = (body: IDataObject, id?: string): IDataObject =>
	id && body.id === undefined ? { id, ...body } : body;
