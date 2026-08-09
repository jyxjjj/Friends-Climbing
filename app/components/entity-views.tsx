"use client";

import React, { useState } from "react";
import {
  Alert,
  AvatarGroup,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HikingRoundedIcon from "@mui/icons-material/HikingRounded";
import LandscapeRoundedIcon from "@mui/icons-material/LandscapeRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PhotoLibraryRoundedIcon from "@mui/icons-material/PhotoLibraryRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import { LineChart } from "@mui/x-charts";
import type {
  AppState,
  Member,
  PhotoAsset,
  PhotoCategory,
  Plan,
  TripRecord,
} from "../lib/models";
import type { Navigate } from "../lib/navigation";
import {
  downloadExcel,
  downloadJson,
  downloadPhotoZip,
} from "../lib/exporters";
import { calculateEqualSettlement, fromCents } from "../lib/domain";
import {
  dateLabel,
  DifficultyChip,
  EmptyState,
  formatDuration,
  formatPace,
  KpiCard,
  MemberAvatar,
  money,
  PageHeader,
} from "./ui";

function recordTotal(record: TripRecord) {
  return fromCents(
    calculateEqualSettlement(record.participants, record.expenses).totalCents,
  );
}

function backButton(onClick: () => void, label: string) {
  return (
    <Button
      startIcon={<ArrowBackRoundedIcon />}
      color="inherit"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function MembersView({
  state,
  navigate,
  onNew,
  onEdit,
  onDelete,
}: {
  state: AppState;
  navigate: Navigate;
  onNew: () => void;
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
}) {
  const [query, setQuery] = useState("");
  const members = state.members.filter(
    (member) =>
      !member.isArchived &&
      `${member.nickname}${member.realName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const stats = (id: string) => {
    const records = state.records.filter((record) =>
      record.participants.includes(id),
    );
    return {
      distance: records.reduce((sum, record) => sum + record.actualDistance, 0),
      trips: records.length,
      latest: records.sort((a, b) => b.tripDate.localeCompare(a.tripDate))[0]
        ?.tripDate,
    };
  };
  return (
    <Box>
      <PageHeader
        eyebrow="MEMBERS"
        title="成员管理"
        description="维护团队成员资料，查看每个人的山野成长档案。"
        action={
          <Button
            variant="contained"
            startIcon={<PersonAddAltRoundedIcon />}
            onClick={onNew}
          >
            新增成员
          </Button>
        }
      />
      <Card>
        <CardContent sx={{ p: 0 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            spacing={1.5}
            p={2.2}
            alignItems={{ sm: "center" }}
          >
            <Box>
              <Typography variant="h6">全部成员</Typography>
              <Typography variant="body2" color="text.secondary">
                {members.length} 名活跃成员
              </Typography>
            </Box>
            <TextField
              placeholder="搜索昵称或姓名"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ width: { xs: "100%", sm: 280 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
          <Divider />
          {members.length ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>成员</TableCell>
                    <TableCell>基础体重</TableCell>
                    <TableCell>基础体脂</TableCell>
                    <TableCell>累计里程</TableCell>
                    <TableCell>出行次数</TableCell>
                    <TableCell>最近出行</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => {
                    const summary = stats(member.id);
                    return (
                      <TableRow
                        key={member.id}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => navigate("member-detail", member.id)}
                      >
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1.2}
                            alignItems="center"
                          >
                            <MemberAvatar member={member} size={40} />
                            <Box>
                              <Typography fontWeight={700}>
                                {member.nickname}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {member.realName}
                              </Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>{member.baseWeight.toFixed(1)} kg</TableCell>
                        <TableCell>{member.baseBodyFat.toFixed(1)}%</TableCell>
                        <TableCell>
                          <Typography fontWeight={700}>
                            {summary.distance.toFixed(1)} km
                          </Typography>
                        </TableCell>
                        <TableCell>{summary.trips}</TableCell>
                        <TableCell>
                          {summary.latest ? dateLabel(summary.latest) : "—"}
                        </TableCell>
                        <TableCell
                          align="right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Tooltip title="编辑">
                            <IconButton onClick={() => onEdit(member)}>
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="归档成员">
                            <IconButton
                              color="error"
                              onClick={() => onDelete(member)}
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box p={2}>
              <EmptyState
                title="没有匹配的成员"
                description="换个关键词，或添加一名新成员。"
                action={<Button onClick={onNew}>新增成员</Button>}
              />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export function MemberDetailView({
  state,
  member,
  navigate,
  onEdit,
}: {
  state: AppState;
  member: Member;
  navigate: Navigate;
  onEdit: (member: Member) => void;
}) {
  const records = state.records
    .filter((record) => record.participants.includes(member.id))
    .sort((a, b) => a.tripDate.localeCompare(b.tripDate));
  const distance = records.reduce(
    (sum, record) => sum + record.actualDistance,
    0,
  );
  const duration = records.reduce(
    (sum, record) => sum + record.actualDuration,
    0,
  );
  const metrics = records
    .map((record) => ({
      record,
      metric: record.bodyData.find((item) => item.memberId === member.id),
    }))
    .filter((item) => item.metric);
  const latestWeight =
    [...metrics].reverse().find((item) => item.metric?.afterWeight != null)
      ?.metric?.afterWeight ?? member.baseWeight;
  return (
    <Box>
      {backButton(() => navigate("members"), "返回成员列表")}
      <Card sx={{ mt: 2, mb: 2, overflow: "hidden" }}>
        <Box
          sx={{
            height: 96,
            background: "linear-gradient(110deg,#153c32,#2e735d 65%,#80a696)",
          }}
        />
        <CardContent
          sx={{ mt: -5.5, position: "relative", p: { xs: 2.2, md: 3 } }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ sm: "flex-end" }}
          >
            <Box sx={{ p: 0.6, bgcolor: "white", borderRadius: "50%" }}>
              <MemberAvatar member={member} size={86} />
            </Box>
            <Box flex={1}>
              <Typography variant="h4">{member.nickname}</Typography>
              <Typography color="text.secondary">
                {member.realName} · 基础体重 {member.baseWeight}kg · 基础体脂{" "}
                {member.baseBodyFat}%
              </Typography>
            </Box>
            <Button
              startIcon={<EditRoundedIcon />}
              variant="outlined"
              onClick={() => onEdit(member)}
            >
              编辑资料
            </Button>
          </Stack>
          {member.equipmentNotes && (
            <Paper
              variant="outlined"
              sx={{ mt: 2.4, p: 1.7, borderRadius: 2.5, bgcolor: "#fbfcfb" }}
            >
              <Typography variant="caption" color="text.secondary">
                个人装备备注
              </Typography>
              <Typography mt={0.4}>{member.equipmentNotes}</Typography>
            </Paper>
          )}
        </CardContent>
      </Card>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <KpiCard
          label="累计里程"
          value={distance.toFixed(1)}
          unit="km"
          icon={<RouteRoundedIcon />}
        />
        <KpiCard
          label="累计时长"
          value={(duration / 60).toFixed(1)}
          unit="h"
          icon={<ScheduleRoundedIcon />}
          tint="#547b91"
        />
        <KpiCard
          label="平均配速"
          value={formatPace(duration, distance)}
          icon={<HikingRoundedIcon />}
          tint="#8b6c3d"
        />
        <KpiCard
          label="参与次数"
          value={records.length}
          unit="次"
          icon={<GroupsRoundedIcon />}
          tint="#77628c"
        />
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.3fr .7fr" },
          gap: 2,
          mb: 2,
        }}
      >
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between">
              <Box>
                <Typography variant="h6">体重与体脂变化</Typography>
                <Typography variant="body2" color="text.secondary">
                  按完成行程时间排序，虚线参考基础值
                </Typography>
              </Box>
              <Chip
                label={`当前 ${latestWeight.toFixed(1)}kg`}
                color="primary"
              />
            </Stack>
            {metrics.length ? (
              <LineChart
                height={320}
                xAxis={[
                  {
                    scaleType: "point",
                    data: metrics.map((item) => item.record.tripDate.slice(5)),
                  },
                ]}
                series={[
                  {
                    data: metrics.map(
                      (item) => item.metric?.beforeWeight ?? null,
                    ),
                    label: "爬前体重(kg)",
                    color: "#547b91",
                  },
                  {
                    data: metrics.map(
                      (item) => item.metric?.afterWeight ?? null,
                    ),
                    label: "爬后体重(kg)",
                    color: "#1f5d4a",
                  },
                  {
                    data: metrics.map(
                      (item) => item.metric?.afterBodyFat ?? null,
                    ),
                    label: "爬后体脂(%)",
                    color: "#ed8240",
                  },
                ]}
                grid={{ horizontal: true }}
              />
            ) : (
              <Alert severity="info" sx={{ mt: 4 }}>
                还没有历次身体数据。
              </Alert>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6">阶段变化</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              相对基础档案
            </Typography>
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Typography variant="caption" color="text.secondary">
                  最新爬后体重
                </Typography>
                <Typography variant="h4" mt={0.5}>
                  {latestWeight.toFixed(1)} kg
                </Typography>
                <Chip
                  sx={{ mt: 1 }}
                  size="small"
                  label={`${latestWeight - member.baseWeight >= 0 ? "+" : ""}${(latestWeight - member.baseWeight).toFixed(1)} kg`}
                  color={
                    latestWeight <= member.baseWeight ? "success" : "warning"
                  }
                />
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Typography variant="caption" color="text.secondary">
                  基础体脂率
                </Typography>
                <Typography variant="h4" mt={0.5}>
                  {member.baseBodyFat.toFixed(1)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  每次记录可补充爬前/爬后体脂
                </Typography>
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Box>
      <Card>
        <CardContent>
          <Typography variant="h6">全部参与记录</Typography>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            点击进入完整行程详情
          </Typography>
          <Stack divider={<Divider flexItem />}>
            {[...records].reverse().map((record) => {
              const metric = record.bodyData.find(
                (item) => item.memberId === member.id,
              );
              return (
                <CardActionArea
                  key={record.id}
                  onClick={() => navigate("record-detail", record.id)}
                  sx={{ py: 1.4, px: 0.5, borderRadius: 2 }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ sm: "center" }}
                  >
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
                    <Box flex={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography fontWeight={750}>
                          {record.routeName}
                        </Typography>
                        <DifficultyChip value={record.difficulty} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {dateLabel(record.tripDate)} · {record.actualDistance}km
                        · {formatDuration(record.actualDuration)}
                      </Typography>
                    </Box>
                    {metric?.beforeWeight != null &&
                      metric.afterWeight != null && (
                        <Chip
                          label={`${metric.beforeWeight.toFixed(1)} → ${metric.afterWeight.toFixed(1)}kg`}
                          variant="outlined"
                        />
                      )}
                  </Stack>
                </CardActionArea>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function statusChip(plan: Plan) {
  const map = {
    upcoming: { label: "待出行", color: "primary" as const },
    completed: { label: "已完成", color: "success" as const },
    cancelled: { label: "已取消", color: "default" as const },
  };
  const item = map[plan.status];
  return <Chip size="small" label={item.label} color={item.color} />;
}

export function PlansView({
  state,
  navigate,
  onNew,
}: {
  state: AppState;
  navigate: Navigate;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const list = state.plans.filter(
    (plan) => filter === "all" || plan.status === filter,
  );
  return (
    <Box>
      <PageHeader
        eyebrow="PLANS"
        title="爬山计划"
        description="把路线、成员、预算、装备与风险准备在出发前。"
        action={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={onNew}
          >
            创建计划
          </Button>
        }
      />
      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
        {[
          ["all", "全部"],
          ["upcoming", "待出行"],
          ["completed", "已完成"],
          ["cancelled", "已取消"],
        ].map(([value, label]) => (
          <Chip
            key={value}
            label={label}
            color={filter === value ? "primary" : "default"}
            variant={filter === value ? "filled" : "outlined"}
            onClick={() => setFilter(value)}
          />
        ))}
      </Stack>
      {list.length ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "1fr 1fr",
              xl: "repeat(3, 1fr)",
            },
            gap: 2,
          }}
        >
          {list.map((plan) => {
            const budget = Object.values(plan.budget).reduce(
              (sum, value) => sum + value,
              0,
            );
            return (
              <Card key={plan.id}>
                <CardActionArea
                  onClick={() => navigate("plan-detail", plan.id)}
                  sx={{ height: "100%" }}
                >
                  <CardContent sx={{ p: 2.4 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      mb={2}
                    >
                      {statusChip(plan)}
                      <DifficultyChip value={plan.difficulty} />
                    </Stack>
                    <Typography variant="h5">{plan.routeName}</Typography>
                    <Stack
                      direction="row"
                      spacing={0.8}
                      alignItems="center"
                      color="text.secondary"
                      mt={1}
                    >
                      <CalendarMonthRoundedIcon fontSize="small" />
                      <Typography variant="body2">
                        {dateLabel(plan.tripDate)}
                      </Typography>
                    </Stack>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3,1fr)",
                        gap: 1,
                        my: 2.2,
                      }}
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          计划里程
                        </Typography>
                        <Typography fontWeight={750}>
                          {plan.plannedDistance} km
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          预计耗时
                        </Typography>
                        <Typography fontWeight={750}>
                          {formatDuration(plan.plannedDuration)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          预估爬升
                        </Typography>
                        <Typography fontWeight={750}>
                          {plan.plannedElevation} m
                        </Typography>
                      </Box>
                    </Box>
                    <Divider sx={{ mb: 1.5 }} />
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <AvatarGroup
                        max={5}
                        sx={{
                          "& .MuiAvatar-root": {
                            width: 32,
                            height: 32,
                            fontSize: 12,
                          },
                        }}
                      >
                        {plan.participants.map((id) => (
                          <MemberAvatar
                            key={id}
                            member={state.members.find(
                              (member) => member.id === id,
                            )}
                            size={32}
                          />
                        ))}
                      </AvatarGroup>
                      <Typography fontWeight={750}>{money(budget)}</Typography>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      ) : (
        <EmptyState
          title="还没有计划"
          description="创建第一次团队出行，让准备更从容。"
          action={
            <Button variant="contained" onClick={onNew}>
              创建计划
            </Button>
          }
        />
      )}
    </Box>
  );
}

export function PlanDetailView({
  state,
  plan,
  navigate,
  onEdit,
  onDelete,
  onGenerate,
}: {
  state: AppState;
  plan: Plan;
  navigate: Navigate;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
  onGenerate: (plan: Plan) => void;
}) {
  const canEdit = plan.createdBy === state.currentUser.email;
  const budgetTotal = Object.values(plan.budget).reduce(
    (sum, value) => sum + value,
    0,
  );
  const linked = state.records.find(
    (record) => record.sourcePlanId === plan.id,
  );
  return (
    <Box>
      {backButton(() => navigate("plans"), "返回计划列表")}
      <Card sx={{ mt: 2, mb: 2 }}>
        <CardContent sx={{ p: { xs: 2.3, md: 3.2 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            spacing={2}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                {statusChip(plan)}
                <DifficultyChip value={plan.difficulty} />
                {!canEdit && (
                  <Chip
                    size="small"
                    icon={<ShieldRoundedIcon />}
                    label="只读"
                  />
                )}
              </Stack>
              <Typography variant="h3" sx={{ fontSize: { xs: 30, md: 40 } }}>
                {plan.routeName}
              </Typography>
              <Typography color="text.secondary" mt={1}>
                {dateLabel(plan.tripDate)} · {plan.participants.length} 人同行
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              {linked ? (
                <Button
                  variant="contained"
                  onClick={() => navigate("record-detail", linked.id)}
                >
                  查看完成记录
                </Button>
              ) : canEdit ? (
                <Button
                  variant="contained"
                  startIcon={<AutoAwesomeRoundedIcon />}
                  onClick={() => onGenerate(plan)}
                >
                  生成完成记录
                </Button>
              ) : null}
              {canEdit && (
                <Button
                  variant="outlined"
                  startIcon={<EditRoundedIcon />}
                  onClick={() => onEdit(plan)}
                >
                  编辑
                </Button>
              )}
              {canEdit && (
                <IconButton color="error" onClick={() => onDelete(plan)}>
                  <DeleteOutlineRoundedIcon />
                </IconButton>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <KpiCard
          label="计划里程"
          value={plan.plannedDistance}
          unit="km"
          icon={<RouteRoundedIcon />}
        />
        <KpiCard
          label="计划时长"
          value={formatDuration(plan.plannedDuration)}
          icon={<ScheduleRoundedIcon />}
          tint="#547b91"
        />
        <KpiCard
          label="预估爬升"
          value={plan.plannedElevation.toLocaleString()}
          unit="m"
          icon={<LandscapeRoundedIcon />}
          tint="#8b6c3d"
        />
        <KpiCard
          label="预算合计"
          value={money(budgetTotal).replace("CN¥", "¥")}
          icon={<PaymentsRoundedIcon />}
          tint="#c76a2a"
        />
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr .85fr" },
          gap: 2,
        }}
      >
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="h6">同行成员</Typography>
              <Stack
                direction="row"
                spacing={1.4}
                mt={2}
                flexWrap="wrap"
                useFlexGap
              >
                {plan.participants.map((id) => {
                  const member = state.members.find((item) => item.id === id);
                  return (
                    <Paper
                      key={id}
                      variant="outlined"
                      sx={{ p: 1.2, pr: 2, borderRadius: 99 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <MemberAvatar member={member} size={34} />
                        <Box>
                          <Typography fontWeight={700}>
                            {member?.nickname}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {member?.realName}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Typography variant="h6">预算预估</Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4,1fr)" },
                  gap: 1.2,
                  mt: 2,
                }}
              >
                {Object.entries(plan.budget).map(([key, value]) => (
                  <Paper
                    key={key}
                    variant="outlined"
                    sx={{ p: 1.4, borderRadius: 2.5 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {key}
                    </Typography>
                    <Typography fontWeight={750}>{money(value)}</Typography>
                  </Paper>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Stack>
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="h6">装备清单</Typography>
              <Typography color="text.secondary" whiteSpace="pre-line" mt={1.4}>
                {plan.equipment || "暂无装备备注"}
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center">
                <ShieldRoundedIcon color="warning" />
                <Typography variant="h6">危险点</Typography>
              </Stack>
              <Typography color="text.secondary" whiteSpace="pre-line" mt={1.4}>
                {plan.risks || "暂无风险备注"}
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center">
                <WaterDropRoundedIcon color="primary" />
                <Typography variant="h6">水源点位</Typography>
              </Stack>
              <Typography color="text.secondary" whiteSpace="pre-line" mt={1.4}>
                {plan.waterPoints || "暂无水源备注"}
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </Box>
  );
}

export function RecordsView({
  state,
  navigate,
  onNew,
}: {
  state: AppState;
  navigate: Navigate;
  onNew: () => void;
}) {
  const [page, setPage] = useState(1);
  const perPage = 6;
  const pages = Math.max(1, Math.ceil(state.records.length / perPage));
  const visible = state.records.slice((page - 1) * perPage, page * perPage);
  return (
    <Box>
      <PageHeader
        eyebrow="TRIP RECORDS"
        title="已完成爬山记录"
        description="从真实行程、AA 费用、身体数据到分类照片，完整保留每次出行。"
        action={
          <Button
            variant="contained"
            startIcon={<HikingRoundedIcon />}
            onClick={onNew}
          >
            录入完成记录
          </Button>
        }
      />
      {visible.length ? (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "1fr 1fr",
                xl: "repeat(3,1fr)",
              },
              gap: 2,
            }}
          >
            {visible.map((record) => {
              const photoCount = state.photos.filter(
                (photo) => photo.recordId === record.id,
              ).length;
              return (
                <Card key={record.id}>
                  <CardActionArea
                    onClick={() => navigate("record-detail", record.id)}
                    sx={{ height: "100%" }}
                  >
                    <Box
                      className="photo-placeholder"
                      sx={{
                        height: 116,
                        position: "relative",
                        display: "flex",
                        alignItems: "flex-end",
                        p: 1.7,
                      }}
                    >
                      <Chip
                        size="small"
                        icon={<PhotoLibraryRoundedIcon />}
                        label={`${photoCount} 张照片`}
                        sx={{ bgcolor: "rgba(255,255,255,.9)" }}
                      />
                    </Box>
                    <CardContent sx={{ p: 2.3 }}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <DifficultyChip value={record.difficulty} />
                        <Typography variant="body2" color="text.secondary">
                          {dateLabel(record.tripDate)}
                        </Typography>
                      </Stack>
                      <Typography variant="h5" mt={1.5}>
                        {record.routeName}
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3,1fr)",
                          gap: 1,
                          my: 2,
                        }}
                      >
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            实际里程
                          </Typography>
                          <Typography fontWeight={750}>
                            {record.actualDistance}km
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            实际耗时
                          </Typography>
                          <Typography fontWeight={750}>
                            {formatDuration(record.actualDuration)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            总花费
                          </Typography>
                          <Typography fontWeight={750}>
                            {money(recordTotal(record))}
                          </Typography>
                        </Box>
                      </Box>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <AvatarGroup
                          max={5}
                          sx={{
                            "& .MuiAvatar-root": {
                              width: 30,
                              height: 30,
                              fontSize: 12,
                            },
                          }}
                        >
                          {record.participants.map((id) => (
                            <MemberAvatar
                              key={id}
                              member={state.members.find(
                                (member) => member.id === id,
                              )}
                              size={30}
                            />
                          ))}
                        </AvatarGroup>
                        <Typography variant="caption" color="text.secondary">
                          爬升 {record.actualElevation.toLocaleString()}m
                        </Typography>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
          <Stack alignItems="center" mt={3}>
            <Pagination
              page={page}
              count={pages}
              color="primary"
              onChange={(_, value) => setPage(value)}
            />
          </Stack>
        </>
      ) : (
        <EmptyState
          title="还没有完成记录"
          description="从已有计划生成，或直接录入一次真实行程。"
          action={
            <Button variant="contained" onClick={onNew}>
              录入第一条记录
            </Button>
          }
        />
      )}
    </Box>
  );
}

const PHOTO_LABELS: Record<PhotoCategory | "all", string> = {
  all: "全部",
  start: "出发点",
  node: "关键节点",
  scenery: "沿途风景",
  finish: "终点",
};

export function RecordDetailView({
  state,
  record,
  navigate,
  onEdit,
  onDelete,
  onNotify,
}: {
  state: AppState;
  record: TripRecord;
  navigate: Navigate;
  onEdit: (record: TripRecord) => void;
  onDelete: (record: TripRecord) => void;
  onNotify: (message: string, severity?: "success" | "error" | "info") => void;
}) {
  const [tab, setTab] = useState(0);
  const [photoFilter, setPhotoFilter] = useState<PhotoCategory | "all">("all");
  const [lightbox, setLightbox] = useState<PhotoAsset | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const canEdit = record.createdBy === state.currentUser.email;
  const photos = state.photos.filter((photo) => photo.recordId === record.id);
  const filteredPhotos =
    photoFilter === "all"
      ? photos
      : photos.filter((photo) => photo.category === photoFilter);
  const exactSettlement = calculateEqualSettlement(
    record.participants,
    record.expenses,
  );
  const total = fromCents(exactSettlement.totalCents);
  const averagePerPerson = record.participants.length
    ? total / record.participants.length
    : 0;
  const settlement = exactSettlement.rows.map((row) => ({
    id: row.memberId,
    paid: fromCents(row.paidCents),
    owed: fromCents(row.owedCents),
    difference: fromCents(row.differenceCents),
  }));
  const sourcePlan = state.plans.find(
    (plan) => plan.id === record.sourcePlanId,
  );
  const downloadAll = async () => {
    setDownloading(true);
    try {
      await downloadPhotoZip(photos, `${record.tripDate}-${record.routeName}`);
      onNotify("图片压缩包已生成", "success");
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : "图片下载失败",
        "error",
      );
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Box>
      {backButton(() => navigate("records"), "返回记录列表")}
      <Card sx={{ mt: 2, mb: 2 }}>
        <CardContent sx={{ p: { xs: 2.3, md: 3.2 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            spacing={2}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <DifficultyChip value={record.difficulty} />
                {sourcePlan && (
                  <Chip
                    size="small"
                    icon={<AutoAwesomeRoundedIcon />}
                    label="由计划生成"
                  />
                )}
                {!canEdit && (
                  <Chip
                    size="small"
                    icon={<ShieldRoundedIcon />}
                    label="只读"
                  />
                )}
              </Stack>
              <Typography variant="h3" sx={{ fontSize: { xs: 30, md: 40 } }}>
                {record.routeName}
              </Typography>
              <Typography color="text.secondary" mt={1}>
                {dateLabel(record.tripDate)} · {record.participants.length}{" "}
                人同行
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {canEdit && (
                <Button
                  variant="outlined"
                  startIcon={<EditRoundedIcon />}
                  onClick={() => onEdit(record)}
                >
                  编辑
                </Button>
              )}
              <IconButton
                onClick={(event) => setMenuAnchor(event.currentTarget)}
              >
                <MoreVertRoundedIcon />
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem
                  onClick={() => {
                    downloadExcel(state, record);
                    setMenuAnchor(null);
                  }}
                >
                  <DownloadRoundedIcon fontSize="small" sx={{ mr: 1 }} />
                  导出 Excel
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    downloadJson(state, record);
                    setMenuAnchor(null);
                  }}
                >
                  <DownloadRoundedIcon fontSize="small" sx={{ mr: 1 }} />
                  导出 JSON
                </MenuItem>
                {canEdit && (
                  <MenuItem
                    sx={{ color: "error.main" }}
                    onClick={() => {
                      onDelete(record);
                      setMenuAnchor(null);
                    }}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" sx={{ mr: 1 }} />
                    删除记录
                  </MenuItem>
                )}
              </Menu>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5,1fr)" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <KpiCard
          label="实际里程"
          value={record.actualDistance}
          unit="km"
          icon={<RouteRoundedIcon />}
        />
        <KpiCard
          label="实际耗时"
          value={formatDuration(record.actualDuration)}
          icon={<ScheduleRoundedIcon />}
          tint="#547b91"
        />
        <KpiCard
          label="累计爬升"
          value={record.actualElevation.toLocaleString()}
          unit="m"
          icon={<LandscapeRoundedIcon />}
          tint="#8b6c3d"
        />
        <KpiCard
          label="平均配速"
          value={formatPace(record.actualDuration, record.actualDistance)}
          icon={<HikingRoundedIcon />}
          tint="#77628c"
        />
        <Box sx={{ gridColumn: { xs: "span 2", md: "span 1" } }}>
          <KpiCard
            label="总花费"
            value={money(total).replace("CN¥", "¥")}
            icon={<PaymentsRoundedIcon />}
            tint="#c76a2a"
          />
        </Box>
      </Box>
      <Card>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Tab label="概览" />
          <Tab label="费用结算" />
          <Tab label="身体数据" />
          <Tab label={`照片 (${photos.length})`} />
          <Tab label="备注" />
        </Tabs>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          {tab === 0 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr .8fr" },
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="h6">同行成员</Typography>
                <Stack
                  direction="row"
                  spacing={1.2}
                  mt={1.5}
                  flexWrap="wrap"
                  useFlexGap
                >
                  {record.participants.map((id) => {
                    const member = state.members.find((item) => item.id === id);
                    return (
                      <Paper
                        key={id}
                        variant="outlined"
                        sx={{ p: 1.2, pr: 2, borderRadius: 99 }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <MemberAvatar member={member} size={34} />
                          <Typography fontWeight={700}>
                            {member?.nickname}
                          </Typography>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  来源计划
                </Typography>
                <Typography variant="h6" mt={0.4}>
                  {sourcePlan?.routeName ?? "独立录入"}
                </Typography>
                {sourcePlan && (
                  <>
                    <Typography variant="body2" color="text.secondary" mt={1}>
                      计划 {sourcePlan.plannedDistance} km / 实际{" "}
                      {record.actualDistance} km
                    </Typography>
                    <Typography
                      variant="body2"
                      color={
                        record.actualDistance >= sourcePlan.plannedDistance
                          ? "success.main"
                          : "warning.main"
                      }
                    >
                      差值{" "}
                      {(
                        record.actualDistance - sourcePlan.plannedDistance
                      ).toFixed(1)}{" "}
                      km
                    </Typography>
                  </>
                )}
              </Paper>
            </Box>
          )}
          {tab === 1 && (
            <Box>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                mb={2}
              >
                <Paper
                  variant="outlined"
                  sx={{ p: 2, borderRadius: 3, flex: 1 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    实际总花费
                  </Typography>
                  <Typography variant="h4">{money(total)}</Typography>
                </Paper>
                <Paper
                  variant="outlined"
                  sx={{ p: 2, borderRadius: 3, flex: 1 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    同行人数
                  </Typography>
                  <Typography variant="h4">
                    {record.participants.length} 人
                  </Typography>
                </Paper>
                <Paper
                  variant="outlined"
                  sx={{ p: 2, borderRadius: 3, flex: 1 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    平均人均
                  </Typography>
                  <Typography variant="h4">
                    {money(averagePerPerson)}
                  </Typography>
                </Paper>
              </Stack>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>成员</TableCell>
                      <TableCell align="right">已垫付</TableCell>
                      <TableCell align="right">精确应付</TableCell>
                      <TableCell align="right">差额</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {settlement.map((row) => {
                      const member = state.members.find(
                        (item) => item.id === row.id,
                      );
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              <MemberAvatar member={member} size={28} />
                              {member?.nickname}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">{money(row.paid)}</TableCell>
                          <TableCell align="right">{money(row.owed)}</TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small"
                              label={`${row.difference >= 0 ? "应收" : "应付"} ${money(Math.abs(row.difference))}`}
                              color={
                                row.difference >= 0 ? "success" : "warning"
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="h6" mt={3} mb={1}>
                费用明细
              </Typography>
              <Stack spacing={1}>
                {record.expenses.map((expense) => (
                  <Paper
                    key={expense.id}
                    variant="outlined"
                    sx={{ p: 1.4, borderRadius: 2.5 }}
                  >
                    <Stack direction="row" justifyContent="space-between">
                      <Box>
                        <Typography fontWeight={700}>
                          {expense.category}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {
                            state.members.find(
                              (member) => member.id === expense.payerId,
                            )?.nickname
                          }{" "}
                          垫付 · {expense.note || "无备注"}
                        </Typography>
                      </Box>
                      <Typography fontWeight={800}>
                        {money(expense.amount)}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
          {tab === 2 && (
            <Stack spacing={1.2}>
              {record.bodyData.map((metric) => {
                const member = state.members.find(
                  (item) => item.id === metric.memberId,
                );
                const diff =
                  metric.beforeWeight != null && metric.afterWeight != null
                    ? metric.afterWeight - metric.beforeWeight
                    : null;
                return (
                  <Paper
                    key={metric.memberId}
                    variant="outlined"
                    sx={{ p: 2, borderRadius: 3 }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      alignItems={{ sm: "center" }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        minWidth={140}
                      >
                        <MemberAvatar member={member} size={38} />
                        <Typography fontWeight={750}>
                          {member?.nickname}
                        </Typography>
                      </Stack>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr 1fr",
                            md: "repeat(4,1fr)",
                          },
                          gap: 1,
                          flex: 1,
                        }}
                      >
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            爬前体重
                          </Typography>
                          <Typography fontWeight={700}>
                            {metric.beforeWeight ?? "—"} kg
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            爬后体重
                          </Typography>
                          <Typography fontWeight={700}>
                            {metric.afterWeight ?? "—"} kg
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            爬前体脂
                          </Typography>
                          <Typography fontWeight={700}>
                            {metric.beforeBodyFat ?? "—"}%
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            爬后体脂
                          </Typography>
                          <Typography fontWeight={700}>
                            {metric.afterBodyFat ?? "—"}%
                          </Typography>
                        </Box>
                      </Box>
                      {diff != null && (
                        <Chip
                          label={`${diff > 0 ? "+" : ""}${diff.toFixed(1)}kg`}
                          color={diff <= 0 ? "success" : "warning"}
                        />
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
          {tab === 3 && (
            <Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                spacing={1.5}
                mb={2}
              >
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {(
                    Object.keys(PHOTO_LABELS) as Array<PhotoCategory | "all">
                  ).map((key) => (
                    <Chip
                      key={key}
                      label={`${PHOTO_LABELS[key]} ${key === "all" ? photos.length : photos.filter((photo) => photo.category === key).length}`}
                      color={photoFilter === key ? "primary" : "default"}
                      variant={photoFilter === key ? "filled" : "outlined"}
                      onClick={() => setPhotoFilter(key)}
                    />
                  ))}
                </Stack>
                <Button
                  variant="outlined"
                  startIcon={<DownloadRoundedIcon />}
                  disabled={!photos.length || downloading}
                  onClick={downloadAll}
                >
                  {downloading ? "正在打包…" : "下载全部图片"}
                </Button>
              </Stack>
              {filteredPhotos.length ? (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" },
                    gap: 1.5,
                  }}
                >
                  {filteredPhotos.map((photo) => (
                    <Card key={photo.id}>
                      <CardActionArea onClick={() => setLightbox(photo)}>
                        <Box
                          component="img"
                          src={photo.url}
                          alt={photo.note || photo.filename}
                          sx={{
                            width: "100%",
                            aspectRatio: "4/3",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <CardContent
                          sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}
                        >
                          <Typography variant="body2" fontWeight={700} noWrap>
                            {photo.note || "暂无备注"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {PHOTO_LABELS[photo.category]} ·{" "}
                            {(photo.size / 1024 / 1024).toFixed(1)}MB
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ))}
                </Box>
              ) : (
                <EmptyState
                  title="这个分类还没有图片"
                  description={
                    canEdit
                      ? "编辑记录时可以批量添加图片。"
                      : "记录创建人尚未上传图片。"
                  }
                />
              )}
            </Box>
          )}
          {tab === 4 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" },
                gap: 2,
              }}
            >
              {[
                ["路况", record.roadCondition],
                ["路线风险", record.routeRisk],
                ["体验评价", record.experience],
              ].map(([label, value]) => (
                <Paper
                  key={label}
                  variant="outlined"
                  sx={{ p: 2.2, borderRadius: 3 }}
                >
                  <Typography variant="h6">{label}</Typography>
                  <Typography
                    color="text.secondary"
                    whiteSpace="pre-line"
                    mt={1.2}
                  >
                    {value || "暂无记录"}
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        maxWidth="lg"
      >
        <IconButton
          onClick={() => setLightbox(null)}
          sx={{
            position: "absolute",
            zIndex: 2,
            right: 10,
            top: 10,
            bgcolor: "rgba(0,0,0,.55)",
            color: "white",
            "&:hover": { bgcolor: "rgba(0,0,0,.72)" },
          }}
        >
          <CloseRoundedIcon />
        </IconButton>
        <DialogContent sx={{ p: 0, bgcolor: "#101513" }}>
          {lightbox && (
            <>
              <Box
                component="img"
                src={lightbox.url}
                alt={lightbox.note || lightbox.filename}
                sx={{
                  display: "block",
                  maxWidth: "90vw",
                  maxHeight: "78vh",
                  objectFit: "contain",
                }}
              />
              <Box sx={{ p: 2, color: "white" }}>
                <Typography fontWeight={700}>
                  {lightbox.note || lightbox.filename}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.72 }}>
                  {PHOTO_LABELS[lightbox.category]}
                </Typography>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
