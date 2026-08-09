"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BackupRoundedIcon from "@mui/icons-material/BackupRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import HikingRoundedIcon from "@mui/icons-material/HikingRounded";
import LandscapeRoundedIcon from "@mui/icons-material/LandscapeRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import { BarChart, LineChart } from "@mui/x-charts";
import type { AppState, TripRecord } from "../lib/models";
import type { Navigate } from "../lib/navigation";
import { downloadExcel, downloadJson } from "../lib/exporters";
import { fromCents, getTeamStats as calculateTeamStats } from "../lib/domain";
import {
  dateLabel,
  DifficultyChip,
  formatDuration,
  KpiCard,
  MemberAvatar,
  money,
  PageHeader,
} from "./ui";

export function getTeamStats(state: AppState) {
  const totals = calculateTeamStats(state.records);
  return {
    distance: totals.distance,
    duration: totals.duration,
    elevation: totals.elevation,
    trips: totals.trips,
    expense: fromCents(totals.expenseCents),
  };
}

function memberRanking(state: AppState) {
  return state.members
    .filter((member) => !member.isArchived)
    .map((member) => {
      const records = state.records.filter((record) =>
        record.participants.includes(member.id),
      );
      return {
        member,
        distance: records.reduce(
          (sum, record) => sum + record.actualDistance,
          0,
        ),
        elevation: records.reduce(
          (sum, record) => sum + record.actualElevation,
          0,
        ),
        duration: records.reduce(
          (sum, record) => sum + record.actualDuration,
          0,
        ),
        trips: records.length,
      };
    })
    .sort(
      (a, b) =>
        b.distance - a.distance ||
        a.member.nickname.localeCompare(b.member.nickname, "zh-CN"),
    );
}

function trendData(records: TripRecord[], months = 6) {
  const anchor = new Date("2026-08-01T00:00:00");
  const items = Array.from({ length: months }, (_, index) => {
    const date = new Date(
      anchor.getFullYear(),
      anchor.getMonth() - (months - 1 - index),
      1,
    );
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const scoped = records.filter((record) => record.tripDate.startsWith(key));
    return {
      label: `${date.getMonth() + 1}月`,
      distance: Number(
        scoped
          .reduce((sum, record) => sum + record.actualDistance, 0)
          .toFixed(1),
      ),
      expense: fromCents(calculateTeamStats(scoped).expenseCents),
    };
  });
  return items;
}

function HeroRidge() {
  return (
    <svg
      className="hero-ridge"
      viewBox="0 0 700 250"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0 233L110 145L171 185L263 50L349 129L420 73L533 175L603 127L700 211"
        stroke="white"
        strokeWidth="4"
      />
      <path
        d="M0 238L110 151L171 191L263 56L349 135L420 79L533 181L603 133L700 217V250H0V238Z"
        fill="white"
        fillOpacity=".25"
      />
      <path
        d="M260 61L286 99L263 89L246 107"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DashboardView({
  state,
  navigate,
  onNewPlan,
  onNewRecord,
}: {
  state: AppState;
  navigate: Navigate;
  onNewPlan: () => void;
  onNewRecord: () => void;
}) {
  const stats = getTeamStats(state);
  const ranking = memberRanking(state);
  const trend = trendData(state.records);
  const nextPlan = state.plans
    .filter(
      (plan) => plan.status === "upcoming" && plan.tripDate >= "2026-08-09",
    )
    .sort((a, b) => a.tripDate.localeCompare(b.tripDate))[0];
  const latest = [...state.records]
    .sort((a, b) => b.tripDate.localeCompare(a.tripDate))
    .slice(0, 3);
  const days = nextPlan
    ? Math.max(
        0,
        Math.ceil(
          (new Date(`${nextPlan.tripDate}T00:00:00`).getTime() -
            new Date("2026-08-09T00:00:00").getTime()) /
            86400000,
        ),
      )
    : 0;
  return (
    <Box>
      <Card
        sx={{
          position: "relative",
          overflow: "hidden",
          bgcolor: "primary.dark",
          color: "white",
          border: 0,
          mb: 3,
          boxShadow: "0 16px 40px rgba(21,60,50,.2)",
        }}
      >
        <HeroRidge />
        <CardContent
          sx={{
            position: "relative",
            zIndex: 1,
            p: { xs: 2.5, md: 4 },
            "&:last-child": { pb: { xs: 2.5, md: 4 } },
          }}
        >
          <Stack
            direction={{ xs: "column", lg: "row" }}
            justifyContent="space-between"
            spacing={3}
            alignItems={{ lg: "flex-end" }}
          >
            <Box maxWidth={650}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1.4}>
                <Chip
                  label="团队总览"
                  size="small"
                  sx={{ bgcolor: "rgba(255,255,255,.15)", color: "white" }}
                />
                <Typography
                  variant="body2"
                  sx={{ color: "rgba(255,255,255,.72)" }}
                >
                  2026-08-09 · 周日
                </Typography>
              </Stack>
              <Typography
                variant="h2"
                sx={{ fontSize: { xs: 32, md: 45 }, lineHeight: 1.12 }}
              >
                每一步，都算数。
              </Typography>
              <Typography
                sx={{
                  color: "rgba(255,255,255,.76)",
                  mt: 1.2,
                  fontSize: { xs: 15, md: 17 },
                }}
              >
                计划、同行、结算与成长，一处管理。把山里的经历沉淀成团队共同的记录。
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<AddRoundedIcon />}
                onClick={onNewPlan}
              >
                新建计划
              </Button>
              <Button
                variant="outlined"
                startIcon={<HikingRoundedIcon />}
                onClick={onNewRecord}
                sx={{
                  color: "white",
                  borderColor: "rgba(255,255,255,.42)",
                  "&:hover": {
                    borderColor: "white",
                    bgcolor: "rgba(255,255,255,.08)",
                  },
                }}
              >
                记录已完成行程
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" },
          gap: 1.6,
          mb: 3,
        }}
      >
        <KpiCard
          label="累计里程"
          value={stats.distance.toFixed(1)}
          unit="km"
          icon={<RouteRoundedIcon />}
          hint="全部有效记录"
        />
        <KpiCard
          label="累计时长"
          value={(stats.duration / 60).toFixed(1)}
          unit="h"
          icon={<ScheduleRoundedIcon />}
          hint={formatDuration(stats.duration)}
          tint="#547b91"
        />
        <KpiCard
          label="累计爬升"
          value={stats.elevation.toLocaleString()}
          unit="m"
          icon={<LandscapeRoundedIcon />}
          hint="实际累计爬升"
          tint="#8b6c3d"
        />
        <KpiCard
          label="出行次数"
          value={stats.trips}
          unit="次"
          icon={<HikingRoundedIcon />}
          hint="团队共同完成"
          tint="#77628c"
        />
        <Box sx={{ gridColumn: { xs: "span 2", md: "span 1" } }}>
          <KpiCard
            label="累计总花费"
            value={money(stats.expense).replace("CN¥", "¥")}
            icon={<PaymentsRoundedIcon />}
            hint="按实际开销统计"
            tint="#c76a2a"
          />
        </Box>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 1.8fr) minmax(300px, .8fr)",
          },
          gap: 2,
          mb: 3,
        }}
      >
        <Card>
          <CardContent sx={{ p: 2.4 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={1}
            >
              <Box>
                <Typography variant="h6">近 6 月趋势</Typography>
                <Typography variant="body2" color="text.secondary">
                  团队里程与开销走势
                </Typography>
              </Box>
              <TrendingUpRoundedIcon color="primary" />
            </Stack>
            <LineChart
              height={290}
              xAxis={[
                { scaleType: "point", data: trend.map((item) => item.label) },
              ]}
              series={[
                {
                  data: trend.map((item) => item.distance),
                  label: "里程(km)",
                  color: "#1f5d4a",
                  curve: "catmullRom",
                },
                {
                  data: trend.map((item) => item.expense / 20),
                  label: "开销(¥÷20)",
                  color: "#ed8240",
                  curve: "catmullRom",
                },
              ]}
              grid={{ horizontal: true }}
              margin={{ left: 44, right: 18, top: 20, bottom: 30 }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.4 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Box>
                <Typography variant="h6">成员里程榜</Typography>
                <Typography variant="body2" color="text.secondary">
                  按累计实际里程排序
                </Typography>
              </Box>
              <EmojiEventsRoundedIcon sx={{ color: "#b58a39" }} />
            </Stack>
            <Stack spacing={1.8}>
              {ranking.slice(0, 4).map((row, index) => (
                <Stack
                  key={row.member.id}
                  direction="row"
                  alignItems="center"
                  spacing={1.2}
                >
                  <Typography
                    width={22}
                    textAlign="center"
                    fontWeight={800}
                    color={index < 3 ? "secondary.main" : "text.secondary"}
                  >
                    {index + 1}
                  </Typography>
                  <MemberAvatar member={row.member} size={36} />
                  <Box flex={1}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={700}>
                        {row.member.nickname}
                      </Typography>
                      <Typography fontWeight={700}>
                        {row.distance.toFixed(1)} km
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={
                        ranking[0]?.distance
                          ? (row.distance / ranking[0].distance) * 100
                          : 0
                      }
                      sx={{
                        height: 6,
                        borderRadius: 99,
                        mt: 0.7,
                        bgcolor: "#edf1ef",
                      }}
                    />
                  </Box>
                </Stack>
              ))}
            </Stack>
            <Button
              fullWidth
              sx={{ mt: 2 }}
              onClick={() => navigate("analytics")}
            >
              查看完整排行榜
            </Button>
          </CardContent>
        </Card>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1.4fr" },
          gap: 2,
        }}
      >
        <Card>
          <CardContent sx={{ p: 2.4 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Box>
                <Typography variant="h6">即将出行</Typography>
                <Typography variant="body2" color="text.secondary">
                  下一次团队计划
                </Typography>
              </Box>
              {nextPlan && (
                <Chip
                  icon={<CalendarMonthRoundedIcon />}
                  label={`${days} 天后`}
                  color="secondary"
                />
              )}
            </Stack>
            {nextPlan ? (
              <CardActionArea
                onClick={() => navigate("plan-detail", nextPlan.id)}
                sx={{ mt: 2, borderRadius: 2.5, p: 0.5 }}
              >
                <Stack spacing={1.2}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="h5">{nextPlan.routeName}</Typography>
                    <DifficultyChip value={nextPlan.difficulty} />
                  </Stack>
                  <Typography color="text.secondary">
                    {dateLabel(nextPlan.tripDate)} · {nextPlan.plannedDistance}{" "}
                    km · {formatDuration(nextPlan.plannedDuration)} · 爬升{" "}
                    {nextPlan.plannedElevation.toLocaleString()} m
                  </Typography>
                  <Stack direction="row" spacing={-0.6}>
                    {nextPlan.participants.map((id) => (
                      <MemberAvatar
                        key={id}
                        member={state.members.find(
                          (member) => member.id === id,
                        )}
                        size={32}
                      />
                    ))}
                  </Stack>
                </Stack>
              </CardActionArea>
            ) : (
              <Typography color="text.secondary" mt={3}>
                暂无待出行计划
              </Typography>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2.4 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={1.2}
            >
              <Box>
                <Typography variant="h6">最近完成</Typography>
                <Typography variant="body2" color="text.secondary">
                  团队最新行迹
                </Typography>
              </Box>
              <Button onClick={() => navigate("records")}>全部记录</Button>
            </Stack>
            <Stack divider={<Divider flexItem />}>
              {latest.map((record) => (
                <CardActionArea
                  key={record.id}
                  onClick={() => navigate("record-detail", record.id)}
                  sx={{ py: 1.25, borderRadius: 2 }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 46,
                        height: 46,
                        borderRadius: 2.5,
                        bgcolor: "#e7f0eb",
                        color: "primary.main",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <HikingRoundedIcon />
                    </Box>
                    <Box flex={1} minWidth={0}>
                      <Typography fontWeight={700} noWrap>
                        {record.routeName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {dateLabel(record.tripDate)} · {record.actualDistance}{" "}
                        km · {formatDuration(record.actualDuration)}
                      </Typography>
                    </Box>
                    <Typography fontWeight={700}>
                      {money(
                        fromCents(calculateTeamStats([record]).expenseCents),
                      )}
                    </Typography>
                  </Stack>
                </CardActionArea>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export function AnalyticsView({ state }: { state: AppState }) {
  const [period, setPeriod] = useState<"year" | "month">("year");
  const stats = getTeamStats(state);
  const ranking = memberRanking(state);
  const trend = useMemo(
    () => trendData(state.records, period === "year" ? 8 : 4),
    [state.records, period],
  );
  const comparisons = state.records
    .filter(
      (record) =>
        record.sourcePlanId &&
        state.plans.some((plan) => plan.id === record.sourcePlanId),
    )
    .map((record) => ({
      name:
        record.routeName.length > 8
          ? `${record.routeName.slice(0, 8)}…`
          : record.routeName,
      planned:
        state.plans.find((plan) => plan.id === record.sourcePlanId)
          ?.plannedDistance ?? 0,
      actual: record.actualDistance,
    }));
  return (
    <Box>
      <PageHeader
        eyebrow="ANALYTICS"
        title="数据统计看板"
        description="统一按有效完成记录统计，年视图按月、月视图按周查看。"
        action={
          <ToggleButtonGroup
            exclusive
            value={period}
            onChange={(_, value) => value && setPeriod(value)}
            size="small"
          >
            <ToggleButton value="year">年视图</ToggleButton>
            <ToggleButton value="month">月视图</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(5, 1fr)" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <KpiCard
          label="团队总里程"
          value={stats.distance.toFixed(1)}
          unit="km"
          icon={<RouteRoundedIcon />}
        />
        <KpiCard
          label="总时长"
          value={(stats.duration / 60).toFixed(1)}
          unit="h"
          icon={<ScheduleRoundedIcon />}
          tint="#547b91"
        />
        <KpiCard
          label="总爬升"
          value={stats.elevation.toLocaleString()}
          unit="m"
          icon={<LandscapeRoundedIcon />}
          tint="#8b6c3d"
        />
        <KpiCard
          label="出行次数"
          value={stats.trips}
          unit="次"
          icon={<HikingRoundedIcon />}
          tint="#77628c"
        />
        <Box sx={{ gridColumn: { xs: "span 2", lg: "span 1" } }}>
          <KpiCard
            label="累计花费"
            value={money(stats.expense).replace("CN¥", "¥")}
            icon={<PaymentsRoundedIcon />}
            tint="#c76a2a"
          />
        </Box>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 2,
          mb: 2,
        }}
      >
        <Card>
          <CardContent>
            <Typography variant="h6">周期爬山里程</Typography>
            <Typography variant="body2" color="text.secondary">
              单位：公里
            </Typography>
            <BarChart
              height={300}
              xAxis={[
                { scaleType: "band", data: trend.map((item) => item.label) },
              ]}
              series={[
                {
                  data: trend.map((item) => item.distance),
                  color: "#1f5d4a",
                  label: "里程",
                },
              ]}
              grid={{ horizontal: true }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6">周期实际开销</Typography>
            <Typography variant="body2" color="text.secondary">
              单位：CNY
            </Typography>
            <LineChart
              height={300}
              xAxis={[
                { scaleType: "point", data: trend.map((item) => item.label) },
              ]}
              series={[
                {
                  data: trend.map((item) => item.expense),
                  color: "#ed8240",
                  label: "开销",
                  curve: "catmullRom",
                  area: true,
                },
              ]}
              grid={{ horizontal: true }}
            />
          </CardContent>
        </Card>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.15fr .85fr" },
          gap: 2,
        }}
      >
        <Card>
          <CardContent>
            <Typography variant="h6">路线计划 vs 实际</Typography>
            <Typography variant="body2" color="text.secondary">
              仅统计有关联计划的完成记录，单位：公里
            </Typography>
            {comparisons.length ? (
              <BarChart
                height={320}
                xAxis={[
                  {
                    scaleType: "band",
                    data: comparisons.map((item) => item.name),
                  },
                ]}
                series={[
                  {
                    data: comparisons.map((item) => item.planned),
                    label: "计划里程",
                    color: "#9ab2a8",
                  },
                  {
                    data: comparisons.map((item) => item.actual),
                    label: "实际里程",
                    color: "#1f5d4a",
                  },
                ]}
                grid={{ horizontal: true }}
              />
            ) : (
              <Typography color="text.secondary" mt={6} textAlign="center">
                暂无有关联计划的完成记录
              </Typography>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6">成员排行榜</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              按累计实际里程降序
            </Typography>
            <Stack spacing={1.7}>
              {ranking.map((row, index) => (
                <Stack
                  key={row.member.id}
                  direction="row"
                  spacing={1.2}
                  alignItems="center"
                >
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      bgcolor:
                        index === 0
                          ? "#f5e4ad"
                          : index === 1
                            ? "#e7eaeb"
                            : index === 2
                              ? "#efd6c1"
                              : "#eff3f1",
                      color: "text.primary",
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <MemberAvatar member={row.member} size={38} />
                  <Box flex={1}>
                    <Stack justifyContent="space-between" direction="row">
                      <Typography fontWeight={700}>
                        {row.member.nickname}
                      </Typography>
                      <Typography fontWeight={800}>
                        {row.distance.toFixed(1)} km
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {row.trips} 次 · 爬升 {row.elevation.toLocaleString()}m ·{" "}
                      {formatDuration(row.duration)}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export function BackupView({ state }: { state: AppState }) {
  const [selectedId, setSelectedId] = useState(state.records[0]?.id ?? "");
  const selected = state.records.find((record) => record.id === selectedId);
  return (
    <Box>
      <PageHeader
        eyebrow="BACKUP"
        title="数据导出与备份"
        description="导出结构化文字数据和图片备注清单；图片文件可在单条记录详情中另行打包下载。"
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 2,
        }}
      >
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                bgcolor: "#e6f0eb",
                color: "primary.main",
                borderRadius: 3,
                display: "grid",
                placeItems: "center",
                mb: 2,
              }}
            >
              <BackupRoundedIcon />
            </Box>
            <Typography variant="h5">全量历史记录</Typography>
            <Typography color="text.secondary" mt={1}>
              包含成员、计划、完成记录、费用、身体数据与图片备注元数据。图片二进制文件不包含在
              Excel/JSON 中。
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} mt={3}>
              <Button
                variant="contained"
                startIcon={<DownloadRoundedIcon />}
                onClick={() => downloadExcel(state)}
              >
                导出 Excel
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadRoundedIcon />}
                onClick={() => downloadJson(state)}
              >
                导出 JSON
              </Button>
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                bgcolor: "#fff0e6",
                color: "secondary.main",
                borderRadius: 3,
                display: "grid",
                placeItems: "center",
                mb: 2,
              }}
            >
              <RouteRoundedIcon />
            </Box>
            <Typography variant="h5">选择单条记录</Typography>
            <Typography color="text.secondary" mt={1} mb={2}>
              生成该次行程的文字数据、同行成员、AA
              费用、身体数据与图片备注清单。
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
              {state.records.map((record) => (
                <CardActionArea
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  sx={{
                    p: 1.2,
                    borderRadius: 2,
                    bgcolor:
                      selectedId === record.id ? "#edf5f1" : "transparent",
                  }}
                >
                  <Stack direction="row" justifyContent="space-between">
                    <Box>
                      <Typography fontWeight={700}>
                        {record.routeName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {dateLabel(record.tripDate)}
                      </Typography>
                    </Box>
                    {selectedId === record.id && (
                      <Chip size="small" label="已选择" color="primary" />
                    )}
                  </Stack>
                </CardActionArea>
              ))}
            </Paper>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} mt={2}>
              <Button
                variant="contained"
                disabled={!selected}
                startIcon={<DownloadRoundedIcon />}
                onClick={() => selected && downloadExcel(state, selected)}
              >
                导出 Excel
              </Button>
              <Button
                variant="outlined"
                disabled={!selected}
                startIcon={<DownloadRoundedIcon />}
                onClick={() => selected && downloadJson(state, selected)}
              >
                导出 JSON
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
      <Paper
        variant="outlined"
        sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: "#fbfcfb" }}
      >
        <Typography variant="body2" color="text.secondary">
          Excel 采用开放的 SpreadsheetML 格式，可由 LibreOffice Calc
          等开源表格软件直接打开；JSON 包含 &quot;schemaVersion&quot;、稳定
          ID、ISO 日期与明确单位。
        </Typography>
      </Paper>
    </Box>
  );
}
