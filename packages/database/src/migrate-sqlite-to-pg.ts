/**
 * SQLite → PostgreSQL 데이터 이관 스크립트
 *
 * 사용법:
 *   BETTER_CCFLARE_DB_PATH=/path/to/better-ccflare.db \
 *   DATABASE_URL=postgresql://user:password@localhost:5432/dbname \
 *   bun run packages/database/src/migrate-sqlite-to-pg.ts
 *
 * 옵션:
 *   --dry-run    실제 삽입 없이 읽기만 수행 (검증용)
 *   --skip-requests  requests / request_payloads 테이블 제외 (대용량일 경우)
 */

import { Database } from "bun:sqlite";
import { SQL } from "bun";
import { resolveDbPath } from "./paths";
import { ensureSchemaPg } from "./migrations-pg";
import { BunSqlAdapter } from "./adapters/bun-sql-adapter";

const BATCH_SIZE = 500;
const isDryRun = process.argv.includes("--dry-run");
const skipRequests = process.argv.includes("--skip-requests");

// ──────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────

function placeholders(count: number): string {
	return Array.from({ length: count }, (_, i) => `$${i + 1}`).join(", ");
}

async function migrateTable<T extends Record<string, unknown>>(
	label: string,
	rows: T[],
	insertFn: (batch: T[]) => Promise<void>,
): Promise<void> {
	if (rows.length === 0) {
		console.log(`  ⏭  ${label}: 행 없음, 건너뜀`);
		return;
	}

	let migrated = 0;
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		if (!isDryRun) {
			await insertFn(batch);
		}
		migrated += batch.length;
		process.stdout.write(
			`\r  ✦  ${label}: ${migrated} / ${rows.length} 행 처리됨`,
		);
	}
	console.log(`\r  ✅ ${label}: ${migrated}행 이관 완료${isDryRun ? " (dry-run)" : ""}`);
}

// ──────────────────────────────────────────────
// 각 테이블 이관 함수
// ──────────────────────────────────────────────

async function migrateAccounts(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM accounts")
		.all();

	await migrateTable("accounts", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO accounts (
					id, name, provider, api_key, refresh_token, access_token,
					expires_at, created_at, last_used, request_count, total_requests,
					priority, rate_limited_until, session_start, session_request_count,
					paused, rate_limit_reset, rate_limit_status, rate_limit_remaining,
					auto_fallback_enabled, custom_endpoint, auto_refresh_enabled,
					model_mappings, cross_region_mode
				) VALUES (
					${placeholders(24)}
				) ON CONFLICT (id) DO NOTHING`,
				[
					row.id,
					row.name,
					row.provider ?? "anthropic",
					row.api_key ?? null,
					row.refresh_token ?? "",
					row.access_token ?? null,
					row.expires_at ?? null,
					row.created_at,
					row.last_used ?? null,
					row.request_count ?? 0,
					row.total_requests ?? 0,
					row.priority ?? 0,
					row.rate_limited_until ?? null,
					row.session_start ?? null,
					row.session_request_count ?? 0,
					row.paused ?? 0,
					row.rate_limit_reset ?? null,
					row.rate_limit_status ?? null,
					row.rate_limit_remaining ?? null,
					row.auto_fallback_enabled ?? 0,
					row.custom_endpoint ?? null,
					row.auto_refresh_enabled ?? 0,
					row.model_mappings ?? null,
					row.cross_region_mode ?? "geographic",
				],
			);
		}
	});
}

async function migrateRequests(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM requests")
		.all();

	await migrateTable("requests", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO requests (
					id, timestamp, method, path, account_used, status_code,
					success, error_message, response_time_ms, failover_attempts,
					model, prompt_tokens, completion_tokens, total_tokens, cost_usd,
					output_tokens_per_second, input_tokens, cache_read_input_tokens,
					cache_creation_input_tokens, output_tokens, agent_used,
					api_key_id, api_key_name, client_ip
				) VALUES (
					${placeholders(24)}
				) ON CONFLICT (id) DO NOTHING`,
				[
					row.id,
					row.timestamp,
					row.method,
					row.path,
					row.account_used ?? null,
					row.status_code ?? null,
					row.success ?? null,
					row.error_message ?? null,
					row.response_time_ms ?? null,
					row.failover_attempts ?? 0,
					row.model ?? null,
					row.prompt_tokens ?? 0,
					row.completion_tokens ?? 0,
					row.total_tokens ?? 0,
					row.cost_usd ?? 0,
					row.output_tokens_per_second ?? null,
					row.input_tokens ?? 0,
					row.cache_read_input_tokens ?? 0,
					row.cache_creation_input_tokens ?? 0,
					row.output_tokens ?? 0,
					row.agent_used ?? null,
					row.api_key_id ?? null,
					row.api_key_name ?? null,
					row.client_ip ?? null,
				],
			);
		}
	});
}

async function migrateRequestPayloads(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM request_payloads")
		.all();

	await migrateTable("request_payloads", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO request_payloads (id, json)
				 VALUES ($1, $2)
				 ON CONFLICT (id) DO NOTHING`,
				[row.id, row.json],
			);
		}
	});
}

async function migrateOAuthSessions(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM oauth_sessions")
		.all();

	await migrateTable("oauth_sessions", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO oauth_sessions (id, account_name, verifier, mode, custom_endpoint, created_at, expires_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)
				 ON CONFLICT (id) DO NOTHING`,
				[
					row.id,
					row.account_name,
					row.verifier,
					row.mode,
					row.custom_endpoint ?? null,
					row.created_at,
					row.expires_at,
				],
			);
		}
	});
}

async function migrateAgentPreferences(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM agent_preferences")
		.all();

	await migrateTable("agent_preferences", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO agent_preferences (agent_id, model, updated_at)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (agent_id) DO NOTHING`,
				[row.agent_id, row.model, row.updated_at],
			);
		}
	});
}

async function migrateApiKeys(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM api_keys")
		.all();

	await migrateTable("api_keys", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO api_keys (id, name, hashed_key, prefix_last_8, created_at, last_used, usage_count, is_active, role)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 ON CONFLICT (id) DO NOTHING`,
				[
					row.id,
					row.name,
					row.hashed_key,
					row.prefix_last_8,
					row.created_at,
					row.last_used ?? null,
					row.usage_count ?? 0,
					row.is_active ?? 1,
					row.role ?? "admin",
				],
			);
		}
	});
}

async function migrateClientIpAliases(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	// client_ip_aliases 테이블 존재 여부 확인
	const tableExists = sqlite
		.query<{ cnt: number }, []>(
			"SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='client_ip_aliases'",
		)
		.get();

	if (!tableExists || tableExists.cnt === 0) {
		console.log("  ⏭  client_ip_aliases: 테이블 없음, 건너뜀");
		return;
	}

	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM client_ip_aliases")
		.all();

	// PG에 테이블이 없으면 생성
	if (!isDryRun) {
		await pg.unsafe(`
			CREATE TABLE IF NOT EXISTS client_ip_aliases (
				ip TEXT PRIMARY KEY,
				alias TEXT NOT NULL,
				created_at BIGINT NOT NULL,
				updated_at BIGINT NOT NULL
			)
		`);
	}

	await migrateTable("client_ip_aliases", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO client_ip_aliases (ip, alias, created_at, updated_at)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (ip) DO NOTHING`,
				[row.ip, row.alias, row.created_at, row.updated_at],
			);
		}
	});
}

async function migrateModelTranslations(
	sqlite: Database,
	pg: InstanceType<typeof SQL>,
): Promise<void> {
	const rows = sqlite
		.query<Record<string, unknown>, []>("SELECT * FROM model_translations")
		.all();

	await migrateTable("model_translations", rows, async (batch) => {
		for (const row of batch) {
			await pg.unsafe(
				`INSERT INTO model_translations (id, client_name, bedrock_model_id, is_default, auto_discovered, created_at, updated_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)
				 ON CONFLICT (client_name, bedrock_model_id) DO NOTHING`,
				[
					row.id,
					row.client_name,
					row.bedrock_model_id,
					row.is_default ?? 1,
					row.auto_discovered ?? 0,
					row.created_at,
					row.updated_at,
				],
			);
		}
	});
}

// ──────────────────────────────────────────────
// 메인 진입점
// ──────────────────────────────────────────────

async function main(): Promise<void> {
	// 환경변수 검증
	const dbPath =
		process.env.BETTER_CCFLARE_DB_PATH ??
		process.env.ccflare_DB_PATH ??
		resolveDbPath();
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
		console.error(
			"   예시: DATABASE_URL=postgresql://user:pass@localhost:5432/dbname",
		);
		process.exit(1);
	}

	if (
		!databaseUrl.startsWith("postgres://") &&
		!databaseUrl.startsWith("postgresql://")
	) {
		console.error("❌ DATABASE_URL은 postgres:// 또는 postgresql://로 시작해야 합니다.");
		process.exit(1);
	}

	console.log("=".repeat(60));
	console.log("  better-ccflare: SQLite → PostgreSQL 데이터 이관");
	console.log("=".repeat(60));
	console.log(`  SQLite 경로 : ${dbPath}`);
	console.log(`  PostgreSQL  : ${databaseUrl.replace(/:\/\/[^@]+@/, "://*****@")}`);
	if (isDryRun) console.log("  모드       : DRY-RUN (실제 쓰기 없음)");
	if (skipRequests) console.log("  제외       : requests, request_payloads");
	console.log("=".repeat(60));
	console.log();

	// SQLite 열기 (읽기 전용)
	let sqlite: Database;
	try {
		sqlite = new Database(dbPath, { readonly: true });
	} catch (err) {
		console.error(`❌ SQLite 파일을 열 수 없습니다: ${dbPath}`);
		console.error(`   ${err}`);
		process.exit(1);
	}

	// PostgreSQL 연결
	let pg: InstanceType<typeof SQL>;
	try {
		pg = new SQL(databaseUrl);
		// 연결 테스트
		await pg.unsafe("SELECT 1");
	} catch (err) {
		console.error("❌ PostgreSQL 연결에 실패했습니다.");
		console.error(`   ${err}`);
		sqlite.close();
		process.exit(1);
	}

	console.log("✅ 두 데이터베이스에 연결되었습니다.\n");

	// PG 스키마 보장
	if (!isDryRun) {
		console.log("📐 PostgreSQL 스키마 초기화 중...");
		const adapter = new BunSqlAdapter(pg, false);
		await ensureSchemaPg(adapter);

		// requests 테이블에 client_ip 컬럼 추가 (PG 기본 스키마에 누락)
		await pg.unsafe(
			`ALTER TABLE requests ADD COLUMN IF NOT EXISTS client_ip TEXT`,
		);
		console.log("✅ 스키마 준비 완료\n");
	}

	// 이관 시작
	console.log("📦 데이터 이관 시작...\n");
	const startTime = Date.now();

	try {
		// 외래키 제약 순서에 맞게 이관
		await migrateAccounts(sqlite, pg);
		await migrateOAuthSessions(sqlite, pg);
		await migrateAgentPreferences(sqlite, pg);
		await migrateApiKeys(sqlite, pg);
		await migrateClientIpAliases(sqlite, pg);
		await migrateModelTranslations(sqlite, pg);

		if (!skipRequests) {
			await migrateRequests(sqlite, pg);
			await migrateRequestPayloads(sqlite, pg);
		} else {
			console.log("  ⏭  requests: --skip-requests 옵션으로 건너뜀");
			console.log("  ⏭  request_payloads: --skip-requests 옵션으로 건너뜀");
		}
	} catch (err) {
		console.error(`\n❌ 이관 중 오류 발생: ${err}`);
		sqlite.close();
		await pg.end();
		process.exit(1);
	}

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log();
	console.log("=".repeat(60));
	console.log(`✅ 이관 완료! (${elapsed}초 소요)`);
	if (isDryRun) {
		console.log("   ⚠️  DRY-RUN 모드: 실제로 데이터가 쓰이지 않았습니다.");
	}
	console.log("=".repeat(60));
	console.log();
	console.log("다음 단계:");
	console.log("  1. .env 또는 환경변수에 DATABASE_URL 설정");
	console.log("  2. BETTER_CCFLARE_DB_PATH 환경변수 제거 (또는 유지)");
	console.log("  3. 서버 재시작: bun start");
	console.log();

	sqlite.close();
	await pg.end();
}

main().catch((err) => {
	console.error("예기치 않은 오류:", err);
	process.exit(1);
});
