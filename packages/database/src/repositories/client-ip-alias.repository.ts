import type { BunSqlAdapter } from "../adapters/bun-sql-adapter";

export interface ClientIpAlias {
	ip: string;
	alias: string;
	createdAt: number;
	updatedAt: number;
}

export class ClientIpAliasRepository {
	constructor(private adapter: BunSqlAdapter) {}

	async getAll(): Promise<ClientIpAlias[]> {
		const rows = await this.adapter.query<{
			ip: string;
			alias: string;
			created_at: number;
			updated_at: number;
		}>(
			"SELECT ip, alias, created_at, updated_at FROM client_ip_aliases ORDER BY alias",
		);
		return rows.map((r) => ({
			ip: r.ip,
			alias: r.alias,
			createdAt: r.created_at,
			updatedAt: r.updated_at,
		}));
	}

	async getByIp(ip: string): Promise<ClientIpAlias | null> {
		const row = await this.adapter.get<{
			ip: string;
			alias: string;
			created_at: number;
			updated_at: number;
		}>(
			"SELECT ip, alias, created_at, updated_at FROM client_ip_aliases WHERE ip = ?",
			[ip],
		);
		if (!row) return null;
		return {
			ip: row.ip,
			alias: row.alias,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	async upsert(ip: string, alias: string): Promise<ClientIpAlias> {
		const now = Date.now();
		await this.adapter.run(
			`INSERT INTO client_ip_aliases (ip, alias, created_at, updated_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(ip) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at`,
			[ip, alias, now, now],
		);
		return { ip, alias, createdAt: now, updatedAt: now };
	}

	async delete(ip: string): Promise<boolean> {
		await this.adapter.run("DELETE FROM client_ip_aliases WHERE ip = ?", [ip]);
		return true;
	}
}
