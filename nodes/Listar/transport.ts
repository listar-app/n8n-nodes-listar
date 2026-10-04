import type { IDataObject, IExecuteFunctions, IHttpRequestMethods, JsonObject } from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export const BASE_URL = 'https://api.listar.fr';

const POLL_INTERVAL_MS = 5000;
const LAUNCH_ATTEMPTS = 5;
const MAX_RETRY_AFTER_SECONDS = 60;

export type ListarResponse = { statusCode: number; body: IDataObject; retryAfter?: number };

/** 202 (still running) and 425 (ready, payment being settled) both mean "poll again". */
const isPending = (statusCode: number) => statusCode === 202 || statusCode === 425;

/** A rate limit or a server hiccup: the same request may succeed a bit later. */
const isTransient = (statusCode: number) => statusCode === 429 || statusCode >= 500;

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
	})) as {
		statusCode: number;
		body: IDataObject | string | undefined;
		headers?: Record<string, string | undefined>;
	};

	const responseBody =
		typeof response.body === 'object' && response.body !== null
			? response.body
			: { message: response.body ?? '' };
	const retryAfter = Number(response.headers?.['retry-after']);
	return {
		statusCode: response.statusCode,
		body: responseBody,
		retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
	};
}

/**
 * Sends a request that starts billable work. A 429 is retried after its
 * `Retry-After`: a rate-limited request did nothing, so retrying it cannot
 * bill twice. A request that gets no answer at all is never retried: it may
 * have gone through, and a retry would run (and bill) it a second time.
 */
export async function launchRequest(
	this: IExecuteFunctions,
	path: string,
	body: IDataObject,
	itemIndex: number,
): Promise<ListarResponse> {
	for (let attempt = 1; ; attempt++) {
		let response: ListarResponse;
		try {
			response = await listarRequest.call(this, 'POST', path, body);
		} catch (error) {
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				itemIndex,
				message: 'Listar did not answer',
				description:
					'The request may have gone through anyway, and it is billed if it completes. Check your Listar history before running this item again.',
			});
		}
		if (response.statusCode !== 429 || attempt === LAUNCH_ATTEMPTS) return response;
		await sleep(Math.min(response.retryAfter ?? 10, MAX_RETRY_AFTER_SECONDS) * 1000);
	}
}

/**
 * Turns a final answer into the item to output, or throws a readable error.
 * When the search ID is known, the error carries it (in its description and
 * in `context.searchId`): the search may still complete and be billed, and the
 * "Get Result" operation collects it without paying for it a second time.
 */
export function finalBody(
	this: IExecuteFunctions,
	response: ListarResponse,
	itemIndex: number,
	searchId?: string,
): IDataObject {
	const { statusCode, body } = response;
	if (statusCode >= 200 && statusCode < 300) return body;

	const id = typeof body.id === 'string' ? body.id : searchId;
	const collectLater = id
		? ` Fetch it later with the "Get Result" operation and the search ID ${id}, instead of running this item again.`
		: '';
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
				'Nothing was delivered. Top up your Listar credit in the app: a result already found is settled automatically after the top-up.' +
				collectLater,
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
			description: apiMessage ?? 'Running it again as is will not help.',
		},
		429: {
			message: 'Too many requests sent to Listar',
			description:
				'Wait a minute, or process fewer items at once (at most 20 company searches can run at the same time).' +
				collectLater,
		},
	};
	const known = byStatus[statusCode];
	const error = new NodeApiError(this.getNode(), body as JsonObject, {
		itemIndex,
		httpCode: String(statusCode),
		message: known?.message ?? `Listar answered with HTTP ${statusCode}`,
		description: known?.description ?? `${apiMessage ?? ''}${collectLater}`.trim(),
	});
	if (id) error.context.searchId = id;
	throw error;
}

/**
 * Polls a launched search until it is final or `maxWaitSeconds` runs out. A
 * search still running at the deadline comes back as `{ status: 'pending', id }`
 * rather than an error: it keeps running and is billed once, when it
 * completes, so the "Get Result" operation can collect it later. A poll that
 * fails (rate limit, server or network hiccup) is retried at the next round:
 * failing the item would lose the ID of a search that is still running.
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
		return withId(finalBody.call(this, launched, itemIndex, id), id);
	}

	const deadline = Date.now() + maxWaitSeconds * 1000;
	while (Date.now() + POLL_INTERVAL_MS <= deadline) {
		await sleep(POLL_INTERVAL_MS);
		let polled: ListarResponse;
		try {
			polled = await listarRequest.call(this, 'GET', resultPath(id));
		} catch {
			continue;
		}
		if (isPending(polled.statusCode) || isTransient(polled.statusCode)) continue;
		return withId(finalBody.call(this, polled, itemIndex, id), id);
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
	return withId(finalBody.call(this, response, itemIndex, id), id);
}

const withId = (body: IDataObject, id?: string): IDataObject =>
	id && body.id === undefined ? { id, ...body } : body;
