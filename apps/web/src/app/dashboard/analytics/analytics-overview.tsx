"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { ProviderLogo } from "@/components/ai-tools/provider-identity";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { analyticsDate } from "@/lib/analytics/analytics-calendar";
import { metricChange, type PromptAnalytics } from "@/lib/analytics/prompt-analytics";

const promptConfig = {
  prompts: { label: "Prompts", color: "var(--chart-2)" },
} satisfies ChartConfig;

function OpenAIChartLogo() {
  return <ProviderLogo provider="openai" size={12} />;
}

function AnthropicChartLogo() {
  return <ProviderLogo provider="anthropic" size={12} />;
}

const providerConfig = {
  openai: { label: "OpenAI", color: "var(--chart-2)", icon: OpenAIChartLogo },
  anthropic: { label: "Anthropic", color: "#D97757", icon: AnthropicChartLogo },
} satisfies ChartConfig;

const modelConfig = {
  prompts: { label: "Prompts", color: "var(--chart-3)" },
} satisfies ChartConfig;

const compactDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type MetricCardProps = {
  label: string;
  previous: number;
  series: { date: string; value: number }[];
  value: number;
  valueFormatter?: (value: number) => string;
};

function compactDate(value: string) {
  return compactDateFormatter.format(analyticsDate(value));
}

function MetricCard({
  label,
  previous,
  series,
  value,
  valueFormatter = (metric) => metric.toLocaleString(),
}: MetricCardProps) {
  const change = metricChange(value, previous);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardAction>
          <Badge variant="outline">{change.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex items-end gap-4">
        <div className="min-w-0 flex-1 font-heading text-2xl font-medium tabular-nums">
          {valueFormatter(value)}
        </div>
        <ChartContainer
          config={promptConfig}
          className="h-12 w-24 shrink-0 aspect-auto"
          aria-hidden="true"
        >
          <AreaChart
            accessibilityLayer={false}
            data={series}
            margin={{ top: 4, right: 2, bottom: 2, left: 2 }}
          >
            <Area
              dataKey="value"
              type="monotone"
              fill="var(--color-prompts)"
              fillOpacity={0.18}
              stroke="var(--color-prompts)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function OverviewCards({ analytics }: { analytics: PromptAnalytics }) {
  const { current, previous } = analytics.summary;
  const promptsPerUserSeries = analytics.daily.map((day) => ({
    date: day.date,
    value: day.activeUsers === 0 ? 0 : day.prompts / day.activeUsers,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Total prompts"
        value={current.totalPrompts}
        previous={previous.totalPrompts}
        series={analytics.daily.map((day) => ({ date: day.date, value: day.prompts }))}
      />
      <MetricCard
        label="Active users"
        value={current.activeUsers}
        previous={previous.activeUsers}
        series={analytics.daily.map((day) => ({ date: day.date, value: day.activeUsers }))}
      />
      <MetricCard
        label="Prompts per day"
        value={current.promptsPerDay}
        previous={previous.promptsPerDay}
        series={analytics.daily.map((day) => ({ date: day.date, value: day.prompts }))}
        valueFormatter={(value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      />
      <MetricCard
        label="Prompts per user"
        value={current.promptsPerUser}
        previous={previous.promptsPerUser}
        series={promptsPerUserSeries}
        valueFormatter={(value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      />
    </div>
  );
}

function ProviderActivityChart({ analytics }: { analytics: PromptAnalytics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity by provider</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={providerConfig} className="h-72 w-full aspect-auto">
          <AreaChart
            accessibilityLayer
            aria-label="Daily human prompt totals split between OpenAI and Anthropic"
            data={analytics.daily}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={compactDate}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent labelFormatter={(label) => compactDate(String(label))} />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="openai"
              type="monotone"
              stackId="provider"
              fill="var(--color-openai)"
              stroke="var(--color-openai)"
              fillOpacity={0.42}
            />
            <Area
              dataKey="anthropic"
              type="monotone"
              stackId="provider"
              fill="var(--color-anthropic)"
              stroke="var(--color-anthropic)"
              fillOpacity={0.42}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function ProviderBreakdownChart({ analytics }: { analytics: PromptAnalytics }) {
  const providerData = analytics.providers.map((provider) => ({
    ...provider,
    fill: `var(--color-${provider.provider})`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={providerConfig}
          className="mx-auto h-80 w-full max-w-md aspect-auto"
        >
          <PieChart accessibilityLayer aria-label="Human prompt share by OpenAI and Anthropic">
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="provider" />} />
            <ChartLegend content={<ChartLegendContent nameKey="provider" />} />
            <Pie
              data={providerData}
              dataKey="prompts"
              nameKey="provider"
              innerRadius={64}
              outerRadius={104}
              strokeWidth={2}
            >
              {providerData.map((provider) => (
                <Cell key={provider.provider} fill={provider.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function ModelBreakdownChart({ analytics }: { analytics: PromptAnalytics }) {
  const models = analytics.models.toSorted(
    (first, second) => second.prompts - first.prompts || first.model.localeCompare(second.model),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={modelConfig} className="h-80 w-full aspect-auto">
          <BarChart
            accessibilityLayer
            aria-label="Human prompt count by model"
            data={models}
            layout="vertical"
            margin={{ left: 12 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              dataKey="model"
              type="category"
              tickLine={false}
              axisLine={false}
              width={148}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="prompts" fill="var(--color-prompts)" radius={0} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function AnalyticsCharts({ analytics }: { analytics: PromptAnalytics }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ProviderActivityChart analytics={analytics} />
      <ProviderBreakdownChart analytics={analytics} />
      <ModelBreakdownChart analytics={analytics} />
    </div>
  );
}
