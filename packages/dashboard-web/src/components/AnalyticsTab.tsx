import { format } from "date-fns";
import React, { useCallback, useMemo, useState } from "react";
import type { TimeRange } from "../constants";
import { useAnalytics } from "../hooks/queries";
import {
	AnalyticsControls,
	CumulativeGrowthChart,
	CumulativeTokenComposition,
	type FilterState,
	MainMetricsChart,
	ModelAnalytics,
	PerformanceIndicatorsChart,
	TokenSpeedAnalytics,
	TokenUsageBreakdown,
} from "./analytics";

function toDateStr(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// Returns today's date as YYYY-MM-DD string (local time)
function todayStr() {
	return toDateStr(new Date());
}

// Returns date N days ago as YYYY-MM-DD string (local time)
function daysAgoStr(days: number) {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return toDateStr(d);
}

export const AnalyticsTab = React.memo(() => {
	const [timeRange, setTimeRange] = useState<TimeRange>("custom");
	const [customStartDate, setCustomStartDate] = useState(daysAgoStr(7));
	const [customEndDate, setCustomEndDate] = useState(todayStr());
	const [selectedMetric, setSelectedMetric] = useState("requests");
	const [filterOpen, setFilterOpen] = useState(false);
	const [viewMode, setViewMode] = useState<"normal" | "cumulative">("normal");
	const [modelBreakdown, setModelBreakdown] = useState(false);
	const [filters, setFilters] = useState<FilterState>({
		accounts: [],
		models: [],
		apiKeys: [],
		clientIps: [],
		status: "all",
	});

	// Build custom date range as milliseconds when timeRange === "custom"
	const customDateRange = useMemo(() => {
		if (timeRange !== "custom") return undefined;
		const start = customStartDate
			? new Date(`${customStartDate}T00:00:00`).getTime()
			: null;
		// End date: end of day
		const end = customEndDate
			? new Date(`${customEndDate}T23:59:59`).getTime()
			: Date.now();
		if (!start || Number.isNaN(start)) return undefined;
		return { startMs: start, endMs: end };
	}, [timeRange, customStartDate, customEndDate]);

	// Fetch analytics data with automatic refetch on dependency changes
	const { data: analytics, isLoading: loading } = useAnalytics(
		timeRange,
		filters,
		viewMode,
		modelBreakdown,
		customDateRange,
	);

	// Get unique accounts and models from analytics data
	// Accumulate all seen accounts/models/apiKeys/clientIps to maintain full list for filters
	const [allSeenAccounts, setAllSeenAccounts] = useState<Set<string>>(
		new Set(),
	);
	const [allSeenModels, setAllSeenModels] = useState<Set<string>>(new Set());
	const [allSeenApiKeys, setAllSeenApiKeys] = useState<Set<string>>(new Set());
	const [allSeenClientIps, setAllSeenClientIps] = useState<Set<string>>(
		new Set(),
	);

	// Update seen values whenever analytics data changes
	useMemo(() => {
		if (!analytics) return;

		// Add new accounts
		if (analytics.accountPerformance) {
			setAllSeenAccounts((prev) => {
				const updated = new Set(prev);
				for (const account of analytics.accountPerformance) {
					updated.add(account.name);
				}
				return updated;
			});
		}

		// Add new models
		if (analytics.modelDistribution) {
			setAllSeenModels((prev) => {
				const updated = new Set(prev);
				for (const model of analytics.modelDistribution) {
					updated.add(model.model);
				}
				return updated;
			});
		}

		// Add new API keys
		if (analytics.apiKeyPerformance) {
			setAllSeenApiKeys((prev) => {
				const updated = new Set(prev);
				for (const apiKey of analytics.apiKeyPerformance) {
					updated.add(apiKey.name);
				}
				return updated;
			});
		}

		// Add new client IPs
		if (analytics.clientIpPerformance) {
			const ips = analytics.clientIpPerformance;
			setAllSeenClientIps((prev) => {
				const updated = new Set(prev);
				for (const entry of ips) {
					updated.add(entry.ip);
				}
				return updated;
			});
		}
	}, [analytics]);

	// Convert sets to sorted arrays for filter dropdowns
	const availableAccounts = useMemo(
		() => Array.from(allSeenAccounts).sort(),
		[allSeenAccounts],
	);
	const availableModels = useMemo(
		() => Array.from(allSeenModels).sort(),
		[allSeenModels],
	);
	const availableApiKeys = useMemo(
		() => Array.from(allSeenApiKeys).sort(),
		[allSeenApiKeys],
	);
	const availableClientIps = useMemo(
		() => Array.from(allSeenClientIps).sort(),
		[allSeenClientIps],
	);

	// Build clientIpOptions with alias from latest analytics data
	const clientIpOptions = useMemo(() => {
		const aliasMap = new Map(
			(analytics?.clientIpPerformance ?? []).map((p) => [p.ip, p.alias]),
		);
		return availableClientIps.map((ip) => ({
			ip,
			alias: aliasMap.get(ip),
		}));
	}, [availableClientIps, analytics?.clientIpPerformance]);

	// Memoize filter function
	const filterData = useCallback(
		<T extends { errorRate?: number | string }>(data: T[]): T[] => {
			if (!analytics) return data;

			return data.filter((point) => {
				// Status filter
				if (filters.status !== "all") {
					const errorRate =
						typeof point.errorRate === "string"
							? parseFloat(point.errorRate)
							: point.errorRate || 0;
					if (filters.status === "success" && errorRate > 50) return false;
					if (filters.status === "error" && errorRate <= 50) return false;
				}

				// For time series data, we can't filter by specific accounts/models
				// Those filters will be applied to the other charts
				return true;
			});
		},
		[analytics, filters.status],
	);

	// Memoize expensive time series data transformation
	const data = useMemo(() => {
		if (!analytics?.timeSeries) return [];

		const timeSeries = filterData(analytics.timeSeries);

		// For custom range, determine format based on actual duration
		let isLongRange = timeRange === "30d" || timeRange === "7d";
		if (timeRange === "custom" && customDateRange) {
			const durationMs = customDateRange.endMs - customDateRange.startMs;
			isLongRange = durationMs > 3 * 24 * 60 * 60 * 1000;
		}
		const formatter = isLongRange
			? (date: Date) => format(date, "MMM d")
			: (date: Date) => format(date, "HH:mm");

		return timeSeries.map((point) => ({
			time: formatter(new Date(point.ts)),
			requests: point.requests,
			tokens: point.tokens,
			cost: parseFloat(point.costUsd.toFixed(2)),
			responseTime: Math.round(point.avgResponseTime),
			errorRate: parseFloat(point.errorRate.toFixed(1)),
			cacheHitRate: parseFloat(point.cacheHitRate.toFixed(1)),
			avgTokensPerSecond: point.avgTokensPerSecond || 0,
		}));
	}, [analytics?.timeSeries, timeRange, filterData, customDateRange]);

	// Memoize token usage breakdown calculation
	const tokenBreakdown = useMemo(() => {
		if (!analytics?.tokenBreakdown) return [];

		const total = analytics.totals.totalTokens || 1;
		const breakdown = [
			{
				type: "Input Tokens",
				value: analytics.tokenBreakdown.inputTokens,
				percentage: 0,
			},
			{
				type: "Cache Read",
				value: analytics.tokenBreakdown.cacheReadInputTokens,
				percentage: 0,
			},
			{
				type: "Cache Creation",
				value: analytics.tokenBreakdown.cacheCreationInputTokens,
				percentage: 0,
			},
			{
				type: "Output Tokens",
				value: analytics.tokenBreakdown.outputTokens,
				percentage: 0,
			},
		];

		return breakdown.map((item) => ({
			...item,
			percentage: Math.round((item.value / total) * 100),
		}));
	}, [analytics?.tokenBreakdown, analytics?.totals.totalTokens]);

	// Use real model performance data from backend with filters
	const _modelPerformance =
		analytics?.modelPerformance
			?.filter(
				(perf) =>
					filters.models.length === 0 || filters.models.includes(perf.model),
			)
			?.map((perf) => ({
				model: perf.model,
				avgTime: Math.round(perf.avgResponseTime),
				p95Time: Math.round(perf.p95ResponseTime),
				errorRate: parseFloat(perf.errorRate.toFixed(1)),
			})) || [];

	// Use real cost by model data with filters
	const costByModel =
		analytics?.costByModel
			?.filter(
				(model) =>
					filters.models.length === 0 || filters.models.includes(model.model),
			)
			?.slice(0, 4) || [];

	// Count active filters
	const activeFilterCount =
		filters.accounts.length +
		filters.models.length +
		filters.apiKeys.length +
		filters.clientIps.length +
		(filters.status !== "all" ? 1 : 0);

	return (
		<div className="space-y-6">
			{/* Controls */}
			<AnalyticsControls
				timeRange={timeRange}
				setTimeRange={setTimeRange}
				customStartDate={customStartDate}
				customEndDate={customEndDate}
				setCustomStartDate={setCustomStartDate}
				setCustomEndDate={setCustomEndDate}
				viewMode={viewMode}
				setViewMode={(mode) => {
					setViewMode(mode);
					// Disable per-model breakdown when switching to cumulative
					if (mode === "cumulative") {
						setModelBreakdown(false);
					}
				}}
				filters={filters}
				setFilters={setFilters}
				availableAccounts={availableAccounts}
				availableModels={availableModels}
				availableApiKeys={availableApiKeys}
				availableClientIps={availableClientIps}
				clientIpOptions={clientIpOptions}
				activeFilterCount={activeFilterCount}
				filterOpen={filterOpen}
				setFilterOpen={setFilterOpen}
				loading={loading}
				onRefresh={() => setTimeRange(timeRange)}
			/>

			{/* Cumulative View - Show cumulative charts first */}
			{viewMode === "cumulative" && analytics && (
				<>
					{/* Beautiful Cumulative Chart */}
					<CumulativeGrowthChart data={data} />

					{/* Cumulative Token Breakdown Ribbon Chart */}
					{tokenBreakdown.length > 0 && (
						<CumulativeTokenComposition tokenBreakdown={tokenBreakdown} />
					)}
				</>
			)}

			{/* Main Metrics Chart */}
			<MainMetricsChart
				data={data}
				rawTimeSeries={analytics?.timeSeries}
				loading={loading}
				viewMode={viewMode}
				timeRange={timeRange}
				selectedMetric={selectedMetric}
				setSelectedMetric={setSelectedMetric}
				modelBreakdown={modelBreakdown}
				onModelBreakdownChange={setModelBreakdown}
			/>

			{/* Normal View Charts - Only show in normal mode */}
			{viewMode === "normal" && (
				<>
					{/* Secondary Charts Row */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<PerformanceIndicatorsChart
							data={data}
							loading={loading}
							modelBreakdown={modelBreakdown}
							rawTimeSeries={analytics?.timeSeries}
							timeRange={timeRange}
						/>
						<TokenUsageBreakdown
							tokenBreakdown={tokenBreakdown}
							timeRange={timeRange}
						/>
					</div>

					{/* Enhanced Model Analytics */}
					<ModelAnalytics
						modelPerformance={analytics?.modelPerformance || []}
						costByModel={costByModel}
						loading={loading}
						timeRange={timeRange}
					/>

					{/* Token Speed Analytics */}
					<TokenSpeedAnalytics
						timeSeriesData={data}
						modelPerformance={analytics?.modelPerformance || []}
						loading={loading}
						timeRange={timeRange}
					/>
				</>
			)}
		</div>
	);
});
