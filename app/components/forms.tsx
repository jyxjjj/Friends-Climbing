"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import LandscapeRoundedIcon from "@mui/icons-material/LandscapeRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  BUDGET_CATEGORIES,
  EMPTY_BUDGET,
  type BodyMetric,
  type Budget,
  type Difficulty,
  type ExpenseItem,
  type Member,
  type PhotoCategory,
  type Plan,
  type TripRecord,
} from "../lib/models";
import { calculateEqualSettlement, fromCents } from "../lib/domain";
import {
  clearDraft,
  draftStorageKey,
  loadDraft,
  saveDraft,
  type SafePlanDraft,
  type SafeRecordDraft,
} from "../lib/drafts";
import { MemberAvatar, money } from "./ui";

const DIFFICULTIES: Difficulty[] = ["休闲", "进阶", "速穿", "重装"];
const today = () => new Date().toISOString().slice(0, 10);
const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, bgcolor: "#fbfcfb" }}>
      <Typography variant="h6" fontSize={17}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" mt={0.4} mb={2}>{description}</Typography>}
      {!description && <Box height={14} />}
      {children}
    </Paper>
  );
}

export function MemberDialog({ open, member, busy, onClose, onSave }: { open: boolean; member: Member | null; busy: boolean; onClose: () => void; onSave: (item: Partial<Member>) => Promise<void> }) {
  const [form, setForm] = useState({ nickname: "", realName: "", baseWeight: "", baseBodyFat: "", equipmentNotes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(member ? { nickname: member.nickname, realName: member.realName, baseWeight: String(member.baseWeight), baseBodyFat: String(member.baseBodyFat), equipmentNotes: member.equipmentNotes } : { nickname: "", realName: "", baseWeight: "", baseBodyFat: "", equipmentNotes: "" });
    setErrors({});
  }, [open, member]);

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.nickname.trim()) nextErrors.nickname = "请输入昵称";
    if (!form.realName.trim()) nextErrors.realName = "请输入真实姓名";
    if (!form.baseWeight || asNumber(form.baseWeight) <= 0) nextErrors.baseWeight = "请输入有效基础体重";
    if (!form.baseBodyFat || asNumber(form.baseBodyFat) <= 0 || asNumber(form.baseBodyFat) > 70) nextErrors.baseBodyFat = "请输入 0–70 之间的体脂率";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSave({ ...member, nickname: form.nickname.trim(), realName: form.realName.trim(), baseWeight: asNumber(form.baseWeight), baseBodyFat: asNumber(form.baseBodyFat), equipmentNotes: form.equipmentNotes.trim() });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 7 }}>{member ? "编辑成员" : "新增成员"}<IconButton onClick={onClose} sx={{ position: "absolute", right: 14, top: 14 }} aria-label="关闭"><CloseRoundedIcon /></IconButton></DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} pt={0.5}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField label="昵称" required value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} error={Boolean(errors.nickname)} helperText={errors.nickname} />
            <TextField label="真实姓名" required value={form.realName} onChange={(event) => setForm({ ...form, realName: event.target.value })} error={Boolean(errors.realName)} helperText={errors.realName} />
            <TextField label="基础体重" required type="number" value={form.baseWeight} onChange={(event) => setForm({ ...form, baseWeight: event.target.value })} error={Boolean(errors.baseWeight)} helperText={errors.baseWeight} inputProps={{ min: 1, step: 0.1, inputMode: "decimal" }} InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }} />
            <TextField label="基础体脂率" required type="number" value={form.baseBodyFat} onChange={(event) => setForm({ ...form, baseBodyFat: event.target.value })} error={Boolean(errors.baseBodyFat)} helperText={errors.baseBodyFat} inputProps={{ min: 0.1, max: 70, step: 0.1, inputMode: "decimal" }} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
          </Box>
          <TextField label="个人装备备注" multiline minRows={3} placeholder="例如：头灯、登山杖、急救包……" value={form.equipmentNotes} onChange={(event) => setForm({ ...form, equipmentNotes: event.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}><Button onClick={onClose} color="inherit">取消</Button><Button variant="contained" onClick={submit} disabled={busy} startIcon={<SaveRoundedIcon />}>{busy ? "保存中…" : "保存成员"}</Button></DialogActions>
    </Dialog>
  );
}

type PlanDraft = {
  id?: string;
  routeName: string;
  difficulty: Difficulty;
  tripDate: string;
  plannedDistance: number | string;
  plannedDuration: number | string;
  plannedElevation: number | string;
  participants: string[];
  budget: Budget;
  equipment: string;
  risks: string;
  waterPoints: string;
};

function planToDraft(plan?: Plan | null): PlanDraft {
  return plan ? { ...plan, budget: { ...plan.budget } } : { routeName: "", difficulty: "休闲", tripDate: today(), plannedDistance: "", plannedDuration: "", plannedElevation: "", participants: [], budget: { ...EMPTY_BUDGET }, equipment: "", risks: "", waterPoints: "" };
}

export function PlanDialog({ open, plan, principal, members, plans, busy, onClose, onSave }: { open: boolean; plan: Plan | null; principal: string; members: Member[]; plans: Plan[]; busy: boolean; onClose: () => void; onSave: (item: Partial<Plan>) => Promise<void> }) {
  const [form, setForm] = useState<PlanDraft>(planToDraft(plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const draftKey = draftStorageKey("plan", principal, plan?.id ?? "new");

  useEffect(() => {
    if (!open) return;
    const base = planToDraft(plan);
    if (!plan) {
      const cached = loadDraft<SafePlanDraft>(localStorage, draftKey, "plan");
      if (cached) {
        setForm({ ...base, ...cached });
        setRestored(true);
      } else setForm(base);
    } else setForm(base);
    setErrors({});
  }, [open, plan, draftKey]);

  useEffect(() => {
    if (!open || plan) return;
    const timer = window.setTimeout(() => {
      saveDraft(localStorage, draftKey, "plan", { ...form });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form, open, draftKey, plan]);

  const budgetTotal = Object.values(form.budget).reduce((sum, value) => sum + asNumber(value), 0);
  const activeMembers = members.filter((member) => !member.isArchived);
  const reusable = plans.filter((item) => item.id !== plan?.id);

  const reuse = (id: string) => {
    const source = plans.find((item) => item.id === id);
    if (!source) return;
    setForm((current) => ({ ...current, routeName: source.routeName, difficulty: source.difficulty, plannedDistance: source.plannedDistance, plannedDuration: source.plannedDuration, plannedElevation: source.plannedElevation, equipment: source.equipment, risks: source.risks, waterPoints: source.waterPoints }));
  };

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.routeName.trim()) nextErrors.routeName = "请输入路线名称";
    if (!form.tripDate) nextErrors.tripDate = "请选择出行日期";
    if (asNumber(form.plannedDistance) <= 0) nextErrors.plannedDistance = "计划里程必须大于 0";
    if (asNumber(form.plannedDuration) <= 0) nextErrors.plannedDuration = "计划时长必须大于 0";
    if (asNumber(form.plannedElevation) < 0) nextErrors.plannedElevation = "爬升高度不能小于 0";
    if (!form.participants.length) nextErrors.participants = "至少选择一名同行成员";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSave({ ...plan, ...form, id: plan?.id ?? form.id ?? crypto.randomUUID(), plannedDistance: asNumber(form.plannedDistance), plannedDuration: Math.round(asNumber(form.plannedDuration)), plannedElevation: Math.round(asNumber(form.plannedElevation)), budget: Object.fromEntries(Object.entries(form.budget).map(([key, value]) => [key, asNumber(value)])) as Budget });
    clearDraft(localStorage, draftKey);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle sx={{ pr: 7 }}>{plan ? "编辑爬山计划" : "创建爬山计划"}<IconButton onClick={onClose} sx={{ position: "absolute", right: 14, top: 14 }} aria-label="关闭"><CloseRoundedIcon /></IconButton></DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "#f5f7f4" }}>
        <Stack spacing={2.2}>
          {restored && <Alert severity="info" onClose={() => setRestored(false)}>已恢复上次未提交的计划草稿。</Alert>}
          {!plan && reusable.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "#edf5f1" }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                <Stack direction="row" spacing={1} alignItems="center" flex={1}><AutoAwesomeRoundedIcon color="primary" /><Box><Typography fontWeight={700}>从历史路线快捷复用</Typography><Typography variant="body2" color="text.secondary">回填难度、里程、时长、爬升与路线备注</Typography></Box></Stack>
                <TextField select label="选择历史路线" sx={{ minWidth: 220 }} onChange={(event) => reuse(event.target.value)} value="">{reusable.map((item) => <MenuItem key={item.id} value={item.id}>{item.routeName}</MenuItem>)}</TextField>
              </Stack>
            </Paper>
          )}
          <Section title="路线与时间" description="填写这次出行的核心计划数据。">
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" }, gap: 2 }}>
              <TextField label="路线名称" required value={form.routeName} onChange={(event) => setForm({ ...form, routeName: event.target.value })} error={Boolean(errors.routeName)} helperText={errors.routeName} />
              <TextField select label="难度" required value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as Difficulty })}>{DIFFICULTIES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
              <TextField label="计划出行日期" type="date" required value={form.tripDate} onChange={(event) => setForm({ ...form, tripDate: event.target.value })} error={Boolean(errors.tripDate)} helperText={errors.tripDate} InputLabelProps={{ shrink: true }} />
              <TextField label="计划里程" type="number" required value={form.plannedDistance} onChange={(event) => setForm({ ...form, plannedDistance: event.target.value })} error={Boolean(errors.plannedDistance)} helperText={errors.plannedDistance} inputProps={{ min: 0.1, step: 0.1, inputMode: "decimal" }} InputProps={{ endAdornment: <InputAdornment position="end">km</InputAdornment> }} />
              <TextField label="计划时长" type="number" required value={form.plannedDuration} onChange={(event) => setForm({ ...form, plannedDuration: event.target.value })} error={Boolean(errors.plannedDuration)} helperText={errors.plannedDuration || "以分钟计，例如 7 小时填 420"} inputProps={{ min: 1, step: 5, inputMode: "numeric" }} InputProps={{ endAdornment: <InputAdornment position="end">分钟</InputAdornment> }} />
              <TextField label="预估累计爬升" type="number" required value={form.plannedElevation} onChange={(event) => setForm({ ...form, plannedElevation: event.target.value })} error={Boolean(errors.plannedElevation)} helperText={errors.plannedElevation} inputProps={{ min: 0, step: 10, inputMode: "numeric" }} InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} />
            </Box>
          </Section>
          <Section title="同行成员与预算" description="预算默认由全体同行成员等额分摊，完成记录中可按实际开销核算。">
            <Typography variant="subtitle2" mb={0.6}>同行成员 *</Typography>
            <FormControl error={Boolean(errors.participants)} fullWidth>
              <FormGroup row sx={{ gap: 0.4, mb: 1.5 }}>{activeMembers.map((member) => <FormControlLabel key={member.id} control={<Checkbox checked={form.participants.includes(member.id)} onChange={(event) => setForm({ ...form, participants: event.target.checked ? [...form.participants, member.id] : form.participants.filter((id) => id !== member.id) })} />} label={<Stack direction="row" spacing={0.8} alignItems="center"><MemberAvatar member={member} size={26} /><span>{member.nickname}</span></Stack>} />)}</FormGroup>
              {errors.participants && <FormHelperText>{errors.participants}</FormHelperText>}
            </FormControl>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>{BUDGET_CATEGORIES.map((category) => <TextField key={category} label={category} type="number" value={form.budget[category]} onChange={(event) => setForm({ ...form, budget: { ...form.budget, [category]: asNumber(event.target.value) } })} inputProps={{ min: 0, step: 1, inputMode: "decimal" }} InputProps={{ startAdornment: <InputAdornment position="start">¥</InputAdornment> }} />)}</Box>
            <Stack direction="row" justifyContent="flex-end" alignItems="baseline" spacing={1} mt={2}><Typography color="text.secondary">预算合计</Typography><Typography variant="h5" color="primary.main">{money(budgetTotal)}</Typography></Stack>
          </Section>
          <Section title="装备与路线提醒" description="每行一项更便于出行前核对。">
            <Stack spacing={2}><TextField label="携带装备清单" multiline minRows={3} placeholder="头灯、登山杖、雨衣……" value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })} /><TextField label="路线危险点备注" multiline minRows={3} value={form.risks} onChange={(event) => setForm({ ...form, risks: event.target.value })} /><TextField label="沿途水源点位" multiline minRows={3} value={form.waterPoints} onChange={(event) => setForm({ ...form, waterPoints: event.target.value })} /></Stack>
          </Section>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}><Typography variant="caption" color="text.secondary" sx={{ mr: "auto", display: { xs: "none", sm: "block" } }}>仅路线等非敏感草稿保存在本机</Typography><Button onClick={onClose} color="inherit">取消</Button><Button variant="contained" onClick={submit} disabled={busy} startIcon={<SaveRoundedIcon />}>{busy ? "保存中…" : "保存计划"}</Button></DialogActions>
    </Dialog>
  );
}

export interface PendingPhoto {
  id: string;
  file: File;
  category: PhotoCategory;
  note: string;
  preview: string;
}

type RecordDraft = Omit<TripRecord, "createdBy" | "createdAt" | "updatedAt">;

function recordToDraft(record?: TripRecord | null, importedPlan?: Plan | null): RecordDraft {
  if (record) return { id: record.id, sourcePlanId: record.sourcePlanId, routeName: record.routeName, difficulty: record.difficulty, tripDate: record.tripDate, actualDistance: record.actualDistance, actualDuration: record.actualDuration, actualElevation: record.actualElevation, participants: [...record.participants], expenses: record.expenses.map((item) => ({ ...item })), bodyData: record.bodyData.map((item) => ({ ...item })), roadCondition: record.roadCondition, routeRisk: record.routeRisk, experience: record.experience };
  if (importedPlan) return { id: crypto.randomUUID(), sourcePlanId: importedPlan.id, routeName: importedPlan.routeName, difficulty: importedPlan.difficulty, tripDate: importedPlan.tripDate, actualDistance: 0, actualDuration: 0, actualElevation: 0, participants: [...importedPlan.participants], expenses: [], bodyData: importedPlan.participants.map((memberId) => ({ memberId, beforeWeight: null, afterWeight: null, beforeBodyFat: null, afterBodyFat: null })), roadCondition: "", routeRisk: "", experience: "" };
  return { id: crypto.randomUUID(), sourcePlanId: null, routeName: "", difficulty: "休闲", tripDate: today(), actualDistance: 0, actualDuration: 0, actualElevation: 0, participants: [], expenses: [], bodyData: [], roadCondition: "", routeRisk: "", experience: "" };
}

const PHOTO_LABELS: Record<PhotoCategory, string> = { start: "出发点", node: "关键节点", scenery: "沿途风景", finish: "终点" };

export function RecordDialog({ open, record, importedPlan, principal, plans, members, busy, onClose, onSave }: { open: boolean; record: TripRecord | null; importedPlan: Plan | null; principal: string; plans: Plan[]; members: Member[]; busy: boolean; onClose: () => void; onSave: (item: Partial<TripRecord>, pendingPhotos: PendingPhoto[]) => Promise<void> }) {
  const [form, setForm] = useState<RecordDraft>(recordToDraft(record, importedPlan));
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const draftKey = draftStorageKey("record", principal, record?.id ?? "new");
  const activeMembers = members.filter((member) => !member.isArchived);

  useEffect(() => {
    if (!open) return;
    const base = recordToDraft(record, importedPlan);
    if (!record && !importedPlan) {
      const cached = loadDraft<SafeRecordDraft>(localStorage, draftKey, "record");
      if (cached) { setForm({ ...base, ...cached }); setRestored(true); }
      else setForm(base);
    } else setForm(base);
    setPendingPhotos([]);
    setErrors({});
  }, [open, record, importedPlan, draftKey]);

  useEffect(() => {
    if (!open || record || importedPlan) return;
    const timer = window.setTimeout(() => {
      saveDraft(localStorage, draftKey, "record", { ...form });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form, open, draftKey, record, importedPlan]);

  const importPlan = (id: string) => {
    const source = plans.find((item) => item.id === id);
    if (!source) return;
    setForm(recordToDraft(null, source));
  };

  const toggleParticipant = (memberId: string, checked: boolean) => {
    const participants = checked ? [...form.participants, memberId] : form.participants.filter((id) => id !== memberId);
    const bodyData = checked ? [...form.bodyData, { memberId, beforeWeight: null, afterWeight: null, beforeBodyFat: null, afterBodyFat: null }] : form.bodyData.filter((item) => item.memberId !== memberId);
    setForm({ ...form, participants, bodyData });
  };

  const updateBody = (memberId: string, key: keyof Omit<BodyMetric, "memberId">, raw: string) => {
    const value = raw === "" ? null : asNumber(raw);
    setForm({ ...form, bodyData: form.bodyData.map((item) => item.memberId === memberId ? { ...item, [key]: value } : item) });
  };

  const addExpense = () => setForm({ ...form, expenses: [...form.expenses, { id: crypto.randomUUID(), category: "油费", amount: 0, payerId: form.participants[0] ?? "", note: "" }] });
  const updateExpense = (id: string, patch: Partial<ExpenseItem>) => setForm({ ...form, expenses: form.expenses.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const removeExpense = (id: string) => setForm({ ...form, expenses: form.expenses.filter((item) => item.id !== id) });

  const addPhotos = (category: PhotoCategory, files: FileList | null) => {
    if (!files) return;
    const additions = [...files].map((file) => ({ id: crypto.randomUUID(), file, category, note: "", preview: URL.createObjectURL(file) }));
    setPendingPhotos((current) => [...current, ...additions]);
  };

  const exactSettlement = useMemo(() => {
    try {
      return calculateEqualSettlement(form.participants, form.expenses);
    } catch {
      return null;
    }
  }, [form.participants, form.expenses]);
  const total = exactSettlement ? fromCents(exactSettlement.totalCents) : 0;
  const perPerson = form.participants.length ? total / form.participants.length : 0;
  const settlement = exactSettlement?.rows.map((row) => ({
    memberId: row.memberId,
    paid: fromCents(row.paidCents),
    difference: fromCents(row.differenceCents),
  })) ?? [];

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.routeName.trim()) nextErrors.routeName = "请输入路线名称";
    if (!form.tripDate) nextErrors.tripDate = "请选择日期";
    if (asNumber(form.actualDistance) <= 0) nextErrors.actualDistance = "实际里程必须大于 0";
    if (asNumber(form.actualDuration) <= 0) nextErrors.actualDuration = "实际时长必须大于 0";
    if (!form.participants.length) nextErrors.participants = "至少选择一名同行成员";
    if (form.expenses.some((item) => asNumber(item.amount) < 0 || !item.payerId)) nextErrors.expenses = "请检查费用金额和垫付成员";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSave({ ...form, actualDistance: asNumber(form.actualDistance), actualDuration: Math.round(asNumber(form.actualDuration)), actualElevation: Math.round(asNumber(form.actualElevation)) }, pendingPhotos);
    clearDraft(localStorage, draftKey);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle sx={{ pr: 7 }}>{record ? "编辑完成记录" : "录入已完成爬山记录"}<IconButton onClick={onClose} sx={{ position: "absolute", right: 14, top: 14 }} aria-label="关闭"><CloseRoundedIcon /></IconButton></DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "#f5f7f4" }}>
        <Stack spacing={2.2}>
          {restored && <Alert severity="info" onClose={() => setRestored(false)}>已恢复非敏感路线草稿；同行成员、费用、身体数据和图片从不写入本机缓存。</Alert>}
          {!record && <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: "#edf5f1" }}><Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}><Stack direction="row" spacing={1} alignItems="center" flex={1}><AutoAwesomeRoundedIcon color="primary" /><Box><Typography fontWeight={700}>从计划一键导入</Typography><Typography variant="body2" color="text.secondary">复制路线与同行成员，实际数据保持空白</Typography></Box></Stack><TextField select label="选择计划" value={form.sourcePlanId ?? ""} onChange={(event) => importPlan(event.target.value)} sx={{ minWidth: 230 }}>{plans.map((item) => <MenuItem key={item.id} value={item.id}>{item.routeName} · {item.tripDate}</MenuItem>)}</TextField></Stack></Paper>}
          <Section title="实际行程" description="计划数据可导入，以下数据请按实际完成情况填写。">
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr" }, gap: 2 }}>
              <TextField label="路线名称" required value={form.routeName} onChange={(event) => setForm({ ...form, routeName: event.target.value })} error={Boolean(errors.routeName)} helperText={errors.routeName} />
              <TextField select label="难度" value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as Difficulty })}>{DIFFICULTIES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
              <TextField label="日期" type="date" required value={form.tripDate} onChange={(event) => setForm({ ...form, tripDate: event.target.value })} error={Boolean(errors.tripDate)} helperText={errors.tripDate} InputLabelProps={{ shrink: true }} />
              <TextField label="实际里程" type="number" required value={form.actualDistance} onChange={(event) => setForm({ ...form, actualDistance: asNumber(event.target.value) })} error={Boolean(errors.actualDistance)} helperText={errors.actualDistance} inputProps={{ min: 0.1, step: 0.1, inputMode: "decimal" }} InputProps={{ endAdornment: <InputAdornment position="end">km</InputAdornment> }} />
              <TextField label="实际耗时" type="number" required value={form.actualDuration} onChange={(event) => setForm({ ...form, actualDuration: asNumber(event.target.value) })} error={Boolean(errors.actualDuration)} helperText={errors.actualDuration || "分钟"} inputProps={{ min: 1, step: 1, inputMode: "numeric" }} InputProps={{ endAdornment: <InputAdornment position="end">分钟</InputAdornment> }} />
              <TextField label="实际累计爬升" type="number" value={form.actualElevation} onChange={(event) => setForm({ ...form, actualElevation: asNumber(event.target.value) })} inputProps={{ min: 0, step: 1, inputMode: "numeric" }} InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} />
            </Box>
            <Typography variant="subtitle2" mt={2.2} mb={0.6}>同行成员 *</Typography>
            <FormControl error={Boolean(errors.participants)}><FormGroup row sx={{ gap: 0.4 }}>{activeMembers.map((member) => <FormControlLabel key={member.id} control={<Checkbox checked={form.participants.includes(member.id)} onChange={(event) => toggleParticipant(member.id, event.target.checked)} />} label={<Stack direction="row" spacing={0.8} alignItems="center"><MemberAvatar member={member} size={26} /><span>{member.nickname}</span></Stack>} />)}</FormGroup>{errors.participants && <FormHelperText>{errors.participants}</FormHelperText>}</FormControl>
          </Section>
          <Section title="AA 费用核算" description="MVP 规则：每笔由一名成员垫付，全部费用由全体同行成员等额分摊。">
            <Stack spacing={1.2}>{form.expenses.map((expense, index) => <Paper key={expense.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr 1.5fr auto" }, gap: 1.2, alignItems: "center" }}><TextField select label="类别" value={expense.category} onChange={(event) => updateExpense(expense.id, { category: event.target.value as ExpenseItem["category"] })}>{BUDGET_CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</TextField><TextField label="金额" type="number" value={expense.amount} onChange={(event) => updateExpense(expense.id, { amount: asNumber(event.target.value) })} InputProps={{ startAdornment: <InputAdornment position="start">¥</InputAdornment> }} inputProps={{ min: 0, step: 0.01, inputMode: "decimal" }} /><TextField select label="垫付成员" value={expense.payerId} onChange={(event) => updateExpense(expense.id, { payerId: event.target.value })}>{form.participants.map((id) => { const member = members.find((item) => item.id === id); return <MenuItem key={id} value={id}>{member?.nickname ?? id}</MenuItem>; })}</TextField><TextField label="备注" value={expense.note ?? ""} onChange={(event) => updateExpense(expense.id, { note: event.target.value })} /><IconButton color="error" onClick={() => removeExpense(expense.id)} aria-label={`删除第 ${index + 1} 笔费用`}><DeleteOutlineRoundedIcon /></IconButton></Box></Paper>)}</Stack>
            {errors.expenses && <Alert severity="error" sx={{ mt: 1.2 }}>{errors.expenses}</Alert>}
            <Button startIcon={<AddRoundedIcon />} onClick={addExpense} sx={{ mt: 1.5 }}>添加一笔开销</Button>
            <Paper sx={{ mt: 2, p: 2, bgcolor: "#edf5f1", border: 0 }}><Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between"><Box><Typography variant="caption" color="text.secondary">总花费</Typography><Typography variant="h5">{money(total)}</Typography></Box><Box><Typography variant="caption" color="text.secondary">人均应付</Typography><Typography variant="h5">{money(perPerson)}</Typography></Box><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{settlement.map((row) => { const member = members.find((item) => item.id === row.memberId); return <Chip key={row.memberId} label={`${member?.nickname ?? "成员"} ${row.difference >= 0 ? "应收" : "应付"} ${money(Math.abs(row.difference))}`} color={row.difference >= 0 ? "success" : "warning"} variant="outlined" />; })}</Stack></Stack></Paper>
          </Section>
          <Section title="同行成员身体数据" description="记录爬山前后体重；同时补充体脂率后，成员档案可展示历次体脂趋势。">
            <Stack spacing={1.2}>{form.participants.map((id) => { const member = members.find((item) => item.id === id); const metric = form.bodyData.find((item) => item.memberId === id) ?? { memberId: id, beforeWeight: null, afterWeight: null, beforeBodyFat: null, afterBodyFat: null }; const diff = metric.beforeWeight != null && metric.afterWeight != null ? metric.afterWeight - metric.beforeWeight : null; return <Paper key={id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Stack direction="row" spacing={1} alignItems="center" mb={1.4}><MemberAvatar member={member} size={30} /><Typography fontWeight={700}>{member?.nickname}</Typography>{diff != null && <Chip size="small" label={`${diff > 0 ? "+" : ""}${diff.toFixed(1)}kg`} color={diff <= 0 ? "success" : "warning"} />}</Stack><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.2 }}><TextField label="爬前体重" type="number" value={metric.beforeWeight ?? ""} onChange={(event) => updateBody(id, "beforeWeight", event.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }} /><TextField label="爬后体重" type="number" value={metric.afterWeight ?? ""} onChange={(event) => updateBody(id, "afterWeight", event.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }} /><TextField label="爬前体脂" type="number" value={metric.beforeBodyFat ?? ""} onChange={(event) => updateBody(id, "beforeBodyFat", event.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} /><TextField label="爬后体脂" type="number" value={metric.afterBodyFat ?? ""} onChange={(event) => updateBody(id, "afterBodyFat", event.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} /></Box></Paper>; })}</Stack>
          </Section>
          <Section title="分类图片" description="支持 JPEG、PNG、WebP 批量选择；单图最大 15MB。图片将在保存记录后上传。">
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>{(Object.keys(PHOTO_LABELS) as PhotoCategory[]).map((category) => { const categoryPhotos = pendingPhotos.filter((item) => item.category === category); return <Paper key={category} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}><Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}><Stack direction="row" spacing={1} alignItems="center"><LandscapeRoundedIcon color="primary" /><Typography fontWeight={700}>{PHOTO_LABELS[category]}</Typography><Chip size="small" label={categoryPhotos.length} /></Stack><Button component="label" size="small" startIcon={<CloudUploadRoundedIcon />}>批量选择<input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { addPhotos(category, event.target.files); event.target.value = ""; }} /></Button></Stack>{categoryPhotos.length === 0 ? <Box sx={{ height: 86, border: "1px dashed #b8c8c0", borderRadius: 2, display: "grid", placeItems: "center", color: "text.secondary", bgcolor: "#fafcfb" }}><Typography variant="body2">尚未选择图片</Typography></Box> : <Stack spacing={1}>{categoryPhotos.map((photo) => <Stack key={photo.id} direction="row" spacing={1} alignItems="center"><Box component="img" src={photo.preview} alt="待上传预览" sx={{ width: 54, height: 54, borderRadius: 1.5, objectFit: "cover" }} /><TextField label="图片备注" value={photo.note} onChange={(event) => setPendingPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, note: event.target.value } : item))} fullWidth /><IconButton color="error" onClick={() => { URL.revokeObjectURL(photo.preview); setPendingPhotos((current) => current.filter((item) => item.id !== photo.id)); }}><DeleteOutlineRoundedIcon /></IconButton></Stack>)}</Stack>}</Paper>; })}</Box>
          </Section>
          <Section title="记录备注" description="留下路况、风险与本次出行体验，方便下次复盘。"><Stack spacing={2}><TextField label="路况" multiline minRows={3} value={form.roadCondition} onChange={(event) => setForm({ ...form, roadCondition: event.target.value })} /><TextField label="路线风险" multiline minRows={3} value={form.routeRisk} onChange={(event) => setForm({ ...form, routeRisk: event.target.value })} /><TextField label="本次出行体验评价" multiline minRows={3} value={form.experience} onChange={(event) => setForm({ ...form, experience: event.target.value })} /></Stack></Section>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}><Typography variant="caption" color="text.secondary" sx={{ mr: "auto", display: { xs: "none", sm: "block" } }}>仅非敏感路线草稿自动保存</Typography><Button onClick={onClose} color="inherit">取消</Button><Button variant="contained" onClick={submit} disabled={busy} startIcon={<SaveRoundedIcon />}>{busy ? "保存与上传中…" : "保存完成记录"}</Button></DialogActions>
    </Dialog>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel = "确认删除", busy, onClose, onConfirm }: { open: boolean; title: string; description: string; confirmLabel?: string; busy: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  return <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth><DialogTitle>{title}</DialogTitle><DialogContent><Alert severity="warning">{description}</Alert></DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={onClose} color="inherit">取消</Button><Button onClick={onConfirm} color="error" variant="contained" disabled={busy}>{busy ? "处理中…" : confirmLabel}</Button></DialogActions></Dialog>;
}
