import type { DatabaseOperations } from "@better-ccflare/database";
import { BadRequest } from "@better-ccflare/errors";
import { jsonResponse } from "@better-ccflare/http-common";
import { errorResponse } from "../utils/http-error";

/**
 * GET /api/client-ip-aliases - list all aliases
 */
export function createClientIpAliasesListHandler(dbOps: DatabaseOperations) {
	return async (): Promise<Response> => {
		const aliases = await dbOps.getClientIpAliases();
		return jsonResponse(aliases);
	};
}

/**
 * PUT /api/client-ip-aliases/:ip - upsert alias for an IP
 */
export function createClientIpAliasUpsertHandler(dbOps: DatabaseOperations) {
	return async (req: Request, ip: string): Promise<Response> => {
		const decoded = decodeURIComponent(ip);
		if (!decoded) {
			return errorResponse(BadRequest("IP address is required"));
		}

		let body: { alias?: string };
		try {
			body = await req.json();
		} catch {
			return errorResponse(BadRequest("Invalid JSON body"));
		}

		const alias = body.alias?.trim();
		if (!alias) {
			return errorResponse(
				BadRequest("alias field is required and must not be empty"),
			);
		}

		const result = await dbOps.upsertClientIpAlias(decoded, alias);
		return jsonResponse(result);
	};
}

/**
 * DELETE /api/client-ip-aliases/:ip - remove alias for an IP
 */
export function createClientIpAliasDeleteHandler(dbOps: DatabaseOperations) {
	return async (_req: Request, ip: string): Promise<Response> => {
		const decoded = decodeURIComponent(ip);
		if (!decoded) {
			return errorResponse(BadRequest("IP address is required"));
		}

		await dbOps.deleteClientIpAlias(decoded);
		return jsonResponse({ success: true });
	};
}
