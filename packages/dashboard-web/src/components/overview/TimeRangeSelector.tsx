import { CalendarDays } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

function toDateStr(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function getPresets(): Array<{ label: string; start: string; end: string }> {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const thisMonday = new Date(today);
	const dayOfWeek = today.getDay();
	const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
	thisMonday.setDate(today.getDate() + diffToMonday);

	const lastMonday = new Date(thisMonday);
	lastMonday.setDate(thisMonday.getDate() - 7);
	const lastSunday = new Date(thisMonday);
	lastSunday.setDate(thisMonday.getDate() - 1);

	return [
		{ label: "오늘", start: toDateStr(today), end: toDateStr(today) },
		{ label: "어제", start: toDateStr(yesterday), end: toDateStr(yesterday) },
		{ label: "이번주", start: toDateStr(thisMonday), end: toDateStr(today) },
		{
			label: "지난주",
			start: toDateStr(lastMonday),
			end: toDateStr(lastSunday),
		},
	];
}

interface TimeRangeSelectorProps {
	value: string;
	onChange: (value: string) => void;
	customStartDate: string;
	customEndDate: string;
	setCustomStartDate: (date: string) => void;
	setCustomEndDate: (date: string) => void;
}

export function TimeRangeSelector({
	value,
	onChange,
	customStartDate,
	customEndDate,
	setCustomStartDate,
	setCustomEndDate,
}: TimeRangeSelectorProps) {
	const presets = getPresets();
	const isPresetActive = (start: string, end: string) =>
		customStartDate === start && customEndDate === end;

	return (
		<div className="flex flex-col gap-2 items-end">
			<div className="flex items-center gap-2">
				<Select value={value} onValueChange={onChange}>
					<SelectTrigger className="w-36">
						<CalendarDays className="h-4 w-4 mr-2" />
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="1h">Last Hour</SelectItem>
						<SelectItem value="6h">Last 6 Hours</SelectItem>
						<SelectItem value="24h">Last 24 Hours</SelectItem>
						<SelectItem value="7d">Last 7 Days</SelectItem>
						<SelectItem value="30d">Last 30 Days</SelectItem>
						<SelectItem value="custom">Custom Range</SelectItem>
					</SelectContent>
				</Select>

				{value === "custom" && (
					<div className="flex items-center gap-2">
						<Input
							type="date"
							value={customStartDate}
							onChange={(e) => setCustomStartDate(e.target.value)}
							className="w-36 h-9 text-sm"
						/>
						<span className="text-muted-foreground text-sm">~</span>
						<Input
							type="date"
							value={customEndDate}
							onChange={(e) => setCustomEndDate(e.target.value)}
							className="w-36 h-9 text-sm"
						/>
					</div>
				)}
			</div>

			{value === "custom" && (
				<div className="flex gap-1.5">
					{presets.map((preset) => (
						<Button
							key={preset.label}
							variant={
								isPresetActive(preset.start, preset.end) ? "default" : "outline"
							}
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => {
								setCustomStartDate(preset.start);
								setCustomEndDate(preset.end);
							}}
						>
							{preset.label}
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
