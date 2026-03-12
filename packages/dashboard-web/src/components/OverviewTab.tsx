import {
	formatCost,
	formatNumber,
	formatPercentage,
	formatTokensPerSecond,
} from "@better-ccflare/ui-common";
import { format } from "date-fns";
import {
	Activity,
	CheckCircle,
	Clock,
	DollarSign,
	Filter,
	Globe,
	Zap,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { REFRESH_INTERVALS } from "../constants";
import {
	useAccounts,
	useAnalytics,
	useDeleteClientIpAlias,
	useStats,
	useUpsertClientIpAlias,
} from "../hooks/queries";
import { ChartsSection } from "./overview/ChartsSection";
import { DataRetentionCard } from "./overview/DataRetentionCard";
import { LoadingSkeleton } from "./overview/LoadingSkeleton";
import { MetricCard } from "./overview/MetricCard";
import { RateLimitInfo } from "./overview/RateLimitInfo";
import { SystemStatus } from "./overview/SystemStatus";
import { TimeRangeSelector } from "./overview/TimeRangeSelector";
import { StrategyCard } from "./StrategyCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

function localDateStr(d = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export const OverviewTab = React.memo(() => {
	// Inline edit state for client IP aliases
	const [editingIp, setEditingIp] = useState<string | null>(null);
	const [editAlias, setEditAlias] = useState("");
	const upsertAlias = useUpsertClientIpAlias();
	const deleteAlias = useDeleteClientIpAlias();

	const handleAliasEdit = (ip: string, currentAlias?: string) => {
		setEditingIp(ip);
		setEditAlias(currentAlias ?? "");
	};

	const handleAliasSave = async (ip: string) => {
		const trimmed = editAlias.trim();
		if (trimmed) {
			await upsertAlias.mutateAsync({ ip, alias: trimmed });
		} else {
			await deleteAlias.mutateAsync(ip);
		}
		setEditingIp(null);
	};

	// Client IP filter state
	const [selectedClientIps, setSelectedClientIps] = useState<string[]>([]);
	const [ipFilterOpen, setIpFilterOpen] = useState(false);

	// Fetch all data using React Query hooks
	const { data: stats, isLoading: statsLoading } = useStats(
		REFRESH_INTERVALS.default,
	);
	const [timeRange, setTimeRange] = useState("custom");
	const [customStartDate, setCustomStartDate] = useState(localDateStr());
	const [customEndDate, setCustomEndDate] = useState(localDateStr());

	const customDateRange = useMemo(() => {
		if (timeRange !== "custom") return undefined;
		const start = customStartDate
			? new Date(`${customStartDate}T00:00:00`).getTime()
			: null;
		const end = customEndDate
			? new Date(`${customEndDate}T23:59:59`).getTime()
			: Date.now();
		if (!start || Number.isNaN(start)) return undefined;
		return { startMs: start, endMs: end };
	}, [timeRange, customStartDate, customEndDate]);

	const { data: analytics, isLoading: analyticsLoading } = useAnalytics(
		timeRange,
		{ accounts: [], models: [], status: "all", clientIps: selectedClientIps },
		"normal",
		undefined,
		customDateRange,
	);
	const { data: accounts, isLoading: accountsLoading } = useAccounts();

	// Available client IPs from stats (topClientIps)
	const availableClientIps = useMemo(
		() => stats?.topClientIps ?? [],
		[stats?.topClientIps],
	);

	const toggleClientIp = (ip: string) => {
		setSelectedClientIps((prev) =>
			prev.includes(ip) ? prev.filter((i) => i !== ip) : [...prev, ip],
		);
	};

	// Memoize percentage change calculation (must be at top level)
	const pctChange = useCallback(
		(current: number, previous: number): number | null => {
			if (previous === 0) return null; // avoid division by zero
			return ((current - previous) / previous) * 100;
		},
		[],
	);

	// Memoize trend period description
	const getTrendPeriod = useCallback((range: string): string => {
		switch (range) {
			case "1h":
				return "previous minute";
			case "6h":
				return "previous 5 minutes";
			case "24h":
				return "previous hour";
			case "7d":
				return "previous hour";
			case "30d":
				return "previous day";
			default:
				return "previous period";
		}
	}, []);

	const loading = statsLoading || analyticsLoading || accountsLoading;
	const combinedData =
		stats && analytics && accounts ? { stats, analytics, accounts } : null;

	// Transform time series data
	const timeSeriesData = useMemo(() => {
		if (!analytics) return [];
		let isLongRange = timeRange === "30d" || timeRange === "7d";
		if (timeRange === "custom" && customDateRange) {
			const durationMs = customDateRange.endMs - customDateRange.startMs;
			isLongRange = durationMs > 3 * 24 * 60 * 60 * 1000;
		}
		const formatter = isLongRange
			? (d: Date) => format(d, "MMM d")
			: (d: Date) => format(d, "HH:mm");
		return analytics.timeSeries.map((point) => ({
			time: formatter(new Date(point.ts)),
			requests: point.requests,
			successRate: point.successRate,
			responseTime: Math.round(point.avgResponseTime),
			cost: point.costUsd.toFixed(2),
			tokensPerSecond: point.avgTokensPerSecond || 0,
		}));
	}, [analytics, timeRange, customDateRange]);

	// Memoize percentage changes calculation
	const trends = useMemo(() => {
		if (timeSeriesData.length < 2) {
			return {
				deltaRequests: null,
				deltaSuccessRate: null,
				deltaResponseTime: null,
				deltaCost: null,
				deltaOutputSpeed: null,
				trendRequests: "flat" as "up" | "down" | "flat",
				trendSuccessRate: "flat" as "up" | "down" | "flat",
				trendResponseTime: "flat" as "up" | "down" | "flat",
				trendCost: "flat" as "up" | "down" | "flat",
				trendOutputSpeed: "flat" as "up" | "down" | "flat",
			};
		}

		const lastBucket = timeSeriesData[timeSeriesData.length - 1];
		const prevBucket = timeSeriesData[timeSeriesData.length - 2];

		// Calculate deltas
		const deltaRequests = pctChange(lastBucket.requests, prevBucket.requests);
		const deltaSuccessRate = pctChange(
			lastBucket.successRate,
			prevBucket.successRate,
		);
		const deltaResponseTime = pctChange(
			lastBucket.responseTime,
			prevBucket.responseTime,
		);
		const deltaCost = pctChange(
			parseFloat(lastBucket.cost),
			parseFloat(prevBucket.cost),
		);
		const deltaOutputSpeed = pctChange(
			lastBucket.tokensPerSecond,
			prevBucket.tokensPerSecond,
		);

		// Helper to determine trend
		const getTrend = (
			delta: number | null,
			invert = false,
		): "up" | "down" | "flat" => {
			if (delta === null) return "flat";
			const isPositive = delta >= 0;
			return invert ? (isPositive ? "down" : "up") : isPositive ? "up" : "down";
		};

		return {
			deltaRequests,
			deltaSuccessRate,
			deltaResponseTime,
			deltaCost,
			deltaOutputSpeed,
			trendRequests: getTrend(deltaRequests),
			trendSuccessRate: getTrend(deltaSuccessRate),
			trendResponseTime: getTrend(deltaResponseTime, true), // invert: higher response time is bad
			trendCost: getTrend(deltaCost, true), // invert: higher cost is bad
			trendOutputSpeed: getTrend(deltaOutputSpeed),
		};
	}, [timeSeriesData, pctChange]);

	if (loading && !combinedData) {
		return <LoadingSkeleton />;
	}

	const trendPeriod = getTrendPeriod(timeRange);

	// Use analytics data for model distribution
	const modelData =
		analytics?.modelDistribution?.map((model) => ({
			name: model.model || "Unknown",
			value: model.count,
		})) || [];

	// Use analytics data for account health
	const accountHealthData = analytics?.accountPerformance || [];

	return (
		<div className="space-y-6">
			{/* Header with Time Range Selector and Client IP Filter */}
			<div className="flex justify-between items-center">
				<h2 className="text-2xl font-semibold">Overview</h2>
				<div className="flex items-center gap-2">
					{availableClientIps.length > 0 && (
						<Popover open={ipFilterOpen} onOpenChange={setIpFilterOpen}>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm">
									<Filter className="h-4 w-4 mr-2" />
									Client IP
									{selectedClientIps.length > 0 && (
										<Badge variant="secondary" className="ml-2 h-5 px-1">
											{selectedClientIps.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-64" align="end">
								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<h4 className="text-sm font-medium">Filter by Client IP</h4>
										{selectedClientIps.length > 0 && (
											<button
												type="button"
												onClick={() => setSelectedClientIps([])}
												className="text-xs text-muted-foreground hover:text-foreground"
											>
												Clear
											</button>
										)}
									</div>
									<div className="max-h-48 overflow-y-auto space-y-1">
										{availableClientIps.map((entry) => (
											<label
												key={entry.ip}
												className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
											>
												<input
													type="checkbox"
													className="rounded border-gray-300"
													checked={selectedClientIps.includes(entry.ip)}
													onChange={() => toggleClientIp(entry.ip)}
												/>
												<span
													className="text-sm font-mono truncate"
													title={entry.alias ? entry.ip : undefined}
												>
													{entry.alias ?? entry.ip}
												</span>
											</label>
										))}
									</div>
									<div className="flex justify-end pt-1 border-t">
										<Button size="sm" onClick={() => setIpFilterOpen(false)}>
											Done
										</Button>
									</div>
								</div>
							</PopoverContent>
						</Popover>
					)}
					<TimeRangeSelector
						value={timeRange}
						onChange={setTimeRange}
						customStartDate={customStartDate}
						customEndDate={customEndDate}
						setCustomStartDate={setCustomStartDate}
						setCustomEndDate={setCustomEndDate}
					/>
				</div>
			</div>

			{/* Metrics Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
				<MetricCard
					title="Total Requests"
					value={formatNumber(analytics?.totals.requests || 0)}
					change={
						trends.deltaRequests !== null ? trends.deltaRequests : undefined
					}
					trend={trends.trendRequests}
					trendPeriod={trendPeriod}
					icon={Activity}
				/>
				<MetricCard
					title="Success Rate"
					value={formatPercentage(analytics?.totals.successRate || 0, 0)}
					change={
						trends.deltaSuccessRate !== null
							? trends.deltaSuccessRate
							: undefined
					}
					trend={trends.trendSuccessRate}
					trendPeriod={trendPeriod}
					icon={CheckCircle}
				/>
				<MetricCard
					title="Avg Response Time"
					value={`${Math.round(analytics?.totals.avgResponseTime || 0)}ms`}
					change={
						trends.deltaResponseTime !== null
							? trends.deltaResponseTime
							: undefined
					}
					trend={trends.trendResponseTime}
					trendPeriod={trendPeriod}
					icon={Clock}
				/>
				<MetricCard
					title="Total Cost"
					value={
						analytics?.totals.totalCostUsd
							? formatCost(analytics.totals.totalCostUsd)
							: "$0.0000"
					}
					change={trends.deltaCost !== null ? trends.deltaCost : undefined}
					trend={trends.trendCost}
					trendPeriod={trendPeriod}
					icon={DollarSign}
				/>
				<MetricCard
					title="Output Speed"
					value={formatTokensPerSecond(analytics?.totals.avgTokensPerSecond)}
					change={
						trends.deltaOutputSpeed !== null
							? trends.deltaOutputSpeed
							: undefined
					}
					trend={trends.trendOutputSpeed}
					trendPeriod={trendPeriod}
					icon={Zap}
				/>
			</div>

			{/* Client IP Usage Table (Second Row) */}
			{analytics?.clientIpPerformance &&
				analytics.clientIpPerformance.length > 0 && (
					<div className="rounded-lg border bg-card">
						<div className="flex items-center gap-2 px-4 py-3 border-b">
							<Globe className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-medium">Client IP 사용량</h3>
							<span className="text-xs text-muted-foreground ml-auto">
								{timeRange === "custom" && customStartDate
									? `${customStartDate} ~ ${customEndDate} 기준`
									: `${timeRange} 기준`}
							</span>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b bg-muted/40">
										<th className="text-left px-4 py-2 font-medium text-muted-foreground">
											#
										</th>
										<th className="text-left px-4 py-2 font-medium text-muted-foreground">
											IP / Alias
										</th>
										<th className="text-right px-4 py-2 font-medium text-muted-foreground">
											요청 수
										</th>
										<th className="text-right px-4 py-2 font-medium text-muted-foreground">
											성공률
										</th>
									</tr>
								</thead>
								<tbody>
									{analytics.clientIpPerformance.map((entry, idx) => (
										<tr
											key={entry.ip}
											className="border-b last:border-0 hover:bg-muted/20"
										>
											<td className="px-4 py-2 text-muted-foreground">
												{idx + 1}
											</td>
											<td className="px-4 py-2">
												{editingIp === entry.ip ? (
													<div className="flex items-center gap-1">
														<input
															type="text"
															value={editAlias}
															onChange={(e) => setEditAlias(e.target.value)}
															onKeyDown={(e) => {
																if (e.key === "Enter")
																	handleAliasSave(entry.ip);
																if (e.key === "Escape") setEditingIp(null);
															}}
															placeholder="별칭 입력..."
															className="h-6 text-xs border rounded px-1 w-28 bg-background"
															// biome-ignore lint/a11y/noAutofocus: intentional focus for inline edit
															autoFocus
														/>
														<button
															type="button"
															onClick={() => handleAliasSave(entry.ip)}
															className="text-xs text-primary hover:underline"
														>
															저장
														</button>
														<button
															type="button"
															onClick={() => setEditingIp(null)}
															className="text-xs text-muted-foreground hover:underline"
														>
															취소
														</button>
													</div>
												) : (
													<div className="flex items-center gap-2">
														<span
															className="font-mono text-xs truncate max-w-[200px]"
															title={entry.alias ? entry.ip : undefined}
														>
															{entry.alias ?? entry.ip}
														</span>
														{entry.alias && (
															<span className="text-xs text-muted-foreground font-mono">
																({entry.ip})
															</span>
														)}
														<button
															type="button"
															onClick={() =>
																handleAliasEdit(entry.ip, entry.alias)
															}
															className="text-xs text-muted-foreground hover:text-foreground shrink-0"
															title="별칭 편집"
														>
															✏️
														</button>
													</div>
												)}
											</td>
											<td className="px-4 py-2 text-right font-mono">
												{formatNumber(entry.requests)}
											</td>
											<td className="px-4 py-2 text-right font-mono">
												<span
													className={
														entry.successRate >= 90
															? "text-green-500"
															: entry.successRate >= 70
																? "text-yellow-500"
																: "text-red-500"
													}
												>
													{entry.successRate.toFixed(1)}%
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}

			<ChartsSection
				timeSeriesData={timeSeriesData}
				modelData={modelData}
				accountHealthData={accountHealthData}
				loading={loading}
			/>

			<SystemStatus recentErrors={stats?.recentErrors} />

			{accounts && <RateLimitInfo accounts={accounts} />}

			{/* Top Client IPs */}
			{stats?.topClientIps && stats.topClientIps.length > 0 && (
				<div className="rounded-lg border bg-card p-4">
					<div className="flex items-center gap-2 mb-3">
						<Globe className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Top Client IPs</h3>
					</div>
					<div className="space-y-2">
						{stats.topClientIps.slice(0, 8).map((entry) => (
							<div
								key={entry.ip}
								className="flex items-center justify-between text-sm"
							>
								<div className="flex items-center gap-2 min-w-0">
									{editingIp === entry.ip ? (
										<div className="flex items-center gap-1">
											<input
												type="text"
												value={editAlias}
												onChange={(e) => setEditAlias(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") handleAliasSave(entry.ip);
													if (e.key === "Escape") setEditingIp(null);
												}}
												placeholder="Enter alias..."
												className="h-6 text-xs border rounded px-1 w-28 bg-background"
												// biome-ignore lint/a11y/noAutofocus: intentional focus for inline edit
												autoFocus
											/>
											<button
												type="button"
												onClick={() => handleAliasSave(entry.ip)}
												className="text-xs text-primary hover:underline"
											>
												Save
											</button>
											<button
												type="button"
												onClick={() => setEditingIp(null)}
												className="text-xs text-muted-foreground hover:underline"
											>
												Cancel
											</button>
										</div>
									) : (
										<>
											<span
												title={entry.alias ? entry.ip : undefined}
												className="font-mono text-xs text-muted-foreground truncate max-w-[140px]"
											>
												{entry.alias ?? entry.ip}
											</span>
											<button
												type="button"
												onClick={() => handleAliasEdit(entry.ip, entry.alias)}
												className="text-xs text-muted-foreground hover:text-foreground shrink-0"
												title="Edit alias"
											>
												✏️
											</button>
										</>
									)}
								</div>
								<div className="flex items-center gap-3 shrink-0">
									<span className="text-muted-foreground">
										{formatNumber(entry.requests)} reqs
									</span>
									<span
										className={
											entry.successRate >= 90
												? "text-green-500"
												: entry.successRate >= 70
													? "text-yellow-500"
													: "text-red-500"
										}
									>
										{entry.successRate}%
									</span>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Configuration Row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<StrategyCard />
				<DataRetentionCard />
			</div>
		</div>
	);
});
