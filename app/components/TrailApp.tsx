"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Avatar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  CircularProgress,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Stack,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoadRoundedIcon from "@mui/icons-material/AddRoadRounded";
import BackupRoundedIcon from "@mui/icons-material/BackupRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HikingRoundedIcon from "@mui/icons-material/HikingRounded";
import InsertChartRoundedIcon from "@mui/icons-material/InsertChartRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import type { AppState, Member, Plan, TripRecord } from "../lib/models";
import type { Navigate, ViewName } from "../lib/navigation";
import { ConfirmDialog, MemberDialog, PlanDialog, RecordDialog, type PendingPhoto } from "./forms";
import { AnalyticsView, BackupView, DashboardView } from "./dashboard-views";
import { MemberDetailView, MembersView, PlanDetailView, PlansView, RecordDetailView, RecordsView } from "./entity-views";
import { appTheme, TrailLogo } from "./ui";

const DRAWER_WIDTH = 252;

const navItems: Array<{ view: ViewName; label: string; icon: React.ReactNode }> = [
  { view: "dashboard", label: "总览", icon: <DashboardRoundedIcon /> },
  { view: "members", label: "成员", icon: <GroupsRoundedIcon /> },
  { view: "plans", label: "爬山计划", icon: <RouteRoundedIcon /> },
  { view: "records", label: "完成记录", icon: <HikingRoundedIcon /> },
  { view: "analytics", label: "数据看板", icon: <InsertChartRoundedIcon /> },
  { view: "backup", label: "导出备份", icon: <BackupRoundedIcon /> },
];

const viewTitles: Record<ViewName, string> = {
  dashboard: "团队总览",
  members: "成员管理",
  "member-detail": "个人数据档案",
  plans: "爬山计划",
  "plan-detail": "计划详情",
  records: "完成记录",
  "record-detail": "记录详情",
  analytics: "数据看板",
  backup: "导出备份",
};

function hashFor(view: ViewName, id?: string) {
  const base: Record<ViewName, string> = { dashboard: "/", members: "/members", "member-detail": "/members", plans: "/plans", "plan-detail": "/plans", records: "/records", "record-detail": "/records", analytics: "/analytics", backup: "/backup" };
  return `#${base[view]}${id ? `/${id}` : ""}`;
}

function parseHash(): { view: ViewName; id?: string } {
  const value = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  const parts = value.split("/").filter(Boolean);
  if (parts[0] === "members") return parts[1] ? { view: "member-detail", id: parts[1] } : { view: "members" };
  if (parts[0] === "plans") return parts[1] ? { view: "plan-detail", id: parts[1] } : { view: "plans" };
  if (parts[0] === "records") return parts[1] ? { view: "record-detail", id: parts[1] } : { view: "records" };
  if (parts[0] === "analytics") return { view: "analytics" };
  if (parts[0] === "backup") return { view: "backup" };
  return { view: "dashboard" };
}

type DeleteTarget = { resource: "member" | "plan" | "record"; id: string; title: string; description: string; backTo?: ViewName };

export default function TrailApp() {
  const mobile = useMediaQuery(appTheme.breakpoints.down("md"));
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewName>("dashboard");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [memberDialog, setMemberDialog] = useState(false);
  const [planDialog, setPlanDialog] = useState(false);
  const [recordDialog, setRecordDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editingRecord, setEditingRecord] = useState<TripRecord | null>(null);
  const [importedPlan, setImportedPlan] = useState<Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [snack, setSnack] = useState<{ message: string; severity: "success" | "error" | "info" } | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);

  const notify = useCallback((message: string, severity: "success" | "error" | "info" = "success") => setSnack({ message, severity }), []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const payload = (await response.json()) as AppState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "无法读取团队数据");
      setState(payload as AppState);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取团队数据");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const initial = parseHash(); setView(initial.view); setSelectedId(initial.id); const listener = () => { const next = parseHash(); setView(next.view); setSelectedId(next.id); }; window.addEventListener("hashchange", listener); return () => window.removeEventListener("hashchange", listener); }, [load]);

  const navigate: Navigate = useCallback((nextView, id) => {
    setView(nextView); setSelectedId(id); setMobileDrawer(false);
    const nextHash = hashFor(nextView, id);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const writeState = async (method: "POST" | "PUT" | "DELETE", payload: object) => {
    const response = await fetch("/api/state", { method, headers: { "Content-Type": "application/json", "X-Summit-Request": "1" }, body: JSON.stringify(payload) });
    const result = (await response.json()) as AppState & { error?: string };
    if (!response.ok) throw new Error(result.error || "操作失败");
    setState(result);
    return result;
  };

  const saveMember = async (item: Partial<Member>) => { setBusy(true); try { await writeState(item.id ? "PUT" : "POST", { resource: "member", item }); setMemberDialog(false); setEditingMember(null); notify(item.id ? "成员资料已更新" : "新成员已添加"); } catch (cause) { notify(cause instanceof Error ? cause.message : "保存失败", "error"); } finally { setBusy(false); } };
  const savePlan = async (item: Partial<Plan>) => { setBusy(true); try { const isEditing = Boolean(editingPlan); const result = await writeState(isEditing ? "PUT" : "POST", { resource: "plan", item }); setPlanDialog(false); setEditingPlan(null); const saved = result.plans.find((plan) => plan.id === item.id); notify(isEditing ? "计划已更新" : "计划已创建"); if (saved) navigate("plan-detail", saved.id); } catch (cause) { notify(cause instanceof Error ? cause.message : "保存失败", "error"); } finally { setBusy(false); } };
  const saveRecord = async (item: Partial<TripRecord>, photos: PendingPhoto[]) => { setBusy(true); try { const recordItem = { ...item, id: item.id || crypto.randomUUID() }; await writeState(editingRecord ? "PUT" : "POST", { resource: "record", item: recordItem }); const grouped = photos.reduce((result, photo) => { const list = result.get(photo.category) ?? []; list.push(photo); result.set(photo.category, list); return result; }, new Map<string, PendingPhoto[]>()); for (const [category, list] of grouped) { const form = new FormData(); form.set("recordId", recordItem.id as string); form.set("category", category); list.forEach((photo, index) => { form.append("files", photo.file); form.append(`note-${index}`, photo.note); }); const response = await fetch("/api/photos", { method: "POST", headers: { "X-Summit-Request": "1" }, body: form }); const payload = (await response.json()) as { error?: string }; if (!response.ok) throw new Error(payload.error || "图片上传失败"); } await load(true); setRecordDialog(false); setEditingRecord(null); setImportedPlan(null); notify(photos.length ? `记录已保存，${photos.length} 张图片上传完成` : "完成记录已保存"); navigate("record-detail", recordItem.id as string); } catch (cause) { notify(cause instanceof Error ? cause.message : "保存失败", "error"); } finally { setBusy(false); } };

  const confirmDelete = async () => { if (!deleteTarget) return; setBusy(true); try { await writeState("DELETE", { resource: deleteTarget.resource, id: deleteTarget.id }); notify(deleteTarget.resource === "member" ? "成员已归档，历史记录仍被保留" : "已删除"); const backTo = deleteTarget.backTo; setDeleteTarget(null); if (backTo) navigate(backTo); } catch (cause) { notify(cause instanceof Error ? cause.message : "删除失败", "error"); } finally { setBusy(false); } };

  const openMember = (member: Member | null = null) => { setEditingMember(member); setMemberDialog(true); };
  const openPlan = (plan: Plan | null = null) => { setEditingPlan(plan); setPlanDialog(true); };
  const openRecord = (record: TripRecord | null = null, plan: Plan | null = null) => { setEditingRecord(record); setImportedPlan(plan); setRecordDialog(true); };

  const selectedMember = state?.members.find((member) => member.id === selectedId);
  const selectedPlan = state?.plans.find((plan) => plan.id === selectedId);
  const selectedRecord = state?.records.find((record) => record.id === selectedId);
  const activeRoot: ViewName = view === "member-detail" ? "members" : view === "plan-detail" ? "plans" : view === "record-detail" ? "records" : view;

  const drawer = state ? <Stack height="100%"><Box px={2.2} py={2.4}><TrailLogo /></Box><Divider /><List sx={{ px: 1.2, pt: 1.4 }}>{navItems.map((item) => <ListItemButton key={item.view} selected={activeRoot === item.view} onClick={() => navigate(item.view)} sx={{ borderRadius: 2.5, mb: 0.5, minHeight: 48, "&.Mui-selected": { bgcolor: "#e4eee9", color: "primary.main" }, "&.Mui-selected:hover": { bgcolor: "#dce9e3" } }}><ListItemIcon sx={{ minWidth: 42, color: "inherit" }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: activeRoot === item.view ? 750 : 550 }} /></ListItemButton>)}</List><Box flex={1} /><Box p={1.5}><PaperAccount state={state} onClick={(event) => setAccountAnchor(event.currentTarget)} /></Box><Box px={2.2} pb={2.2}><Stack direction="row" spacing={0.8} alignItems="center" color="text.secondary"><SaveRoundedIcon sx={{ fontSize: 15 }} /><Typography variant="caption">服务端已同步 · 仅缓存非敏感草稿</Typography></Stack><Button component="a" href="https://github.com/jyxjjj/Friends-Climbing/tree/public-release/sites-v4" target="_blank" rel="noopener noreferrer" size="small" startIcon={<CodeRoundedIcon />} sx={{ mt: 0.8, px: 0, justifyContent: "flex-start", color: "text.secondary", textTransform: "none" }}>源代码 · AGPL-3.0-or-later</Button></Box></Stack> : null;

  if (loading) return <ThemeProvider theme={appTheme}><CssBaseline /><Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default" }}><Stack alignItems="center" spacing={2}><TrailLogo /><CircularProgress size={28} /><Typography color="text.secondary">正在打开团队账本…</Typography></Stack></Box></ThemeProvider>;
  if (error || !state) return <ThemeProvider theme={appTheme}><CssBaseline /><Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}><Alert severity="error" action={<Button onClick={() => load()}>重试</Button>}>{error || "团队数据不可用"}</Alert></Box></ThemeProvider>;

  let content: React.ReactNode;
  if (view === "dashboard") content = <DashboardView state={state} navigate={navigate} onNewPlan={() => openPlan()} onNewRecord={() => openRecord()} />;
  else if (view === "members") content = <MembersView state={state} navigate={navigate} onNew={() => openMember()} onEdit={openMember} onDelete={(member) => setDeleteTarget({ resource: "member", id: member.id, title: `归档成员「${member.nickname}」？`, description: "该成员将从活跃列表隐藏；其历史同行记录、身体数据和费用不会被删除。" })} />;
  else if (view === "member-detail" && selectedMember) content = <MemberDetailView state={state} member={selectedMember} navigate={navigate} onEdit={openMember} />;
  else if (view === "plans") content = <PlansView state={state} navigate={navigate} onNew={() => openPlan()} />;
  else if (view === "plan-detail" && selectedPlan) content = <PlanDetailView state={state} plan={selectedPlan} navigate={navigate} onEdit={openPlan} onGenerate={(plan) => openRecord(null, plan)} onDelete={(plan) => setDeleteTarget({ resource: "plan", id: plan.id, title: `删除计划「${plan.routeName}」？`, description: "删除后无法恢复；已生成完成记录的计划会被系统保护。", backTo: "plans" })} />;
  else if (view === "records") content = <RecordsView state={state} navigate={navigate} onNew={() => openRecord()} />;
  else if (view === "record-detail" && selectedRecord) content = <RecordDetailView state={state} record={selectedRecord} navigate={navigate} onEdit={(record) => openRecord(record)} onDelete={(record) => setDeleteTarget({ resource: "record", id: record.id, title: `删除记录「${record.routeName}」？`, description: "记录、费用、身体数据和已上传图片都会永久删除。", backTo: "records" })} onNotify={notify} />;
  else if (view === "analytics") content = <AnalyticsView state={state} />;
  else if (view === "backup") content = <BackupView state={state} />;
  else content = <Alert severity="warning" action={<Button onClick={() => navigate("dashboard")}>返回总览</Button>}>未找到对应内容</Alert>;

  return <ThemeProvider theme={appTheme}><CssBaseline />
    {!mobile && <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, "& .MuiDrawer-paper": { width: DRAWER_WIDTH, borderRight: "1px solid #dfe7e2", bgcolor: "#fbfcfb" } }}>{drawer}</Drawer>}
    {mobile && <Drawer open={mobileDrawer} onClose={() => setMobileDrawer(false)} sx={{ "& .MuiDrawer-paper": { width: 278 } }}>{drawer}</Drawer>}
    <AppBar position="fixed" color="inherit" elevation={0} sx={{ left: { md: DRAWER_WIDTH }, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, borderBottom: "1px solid", borderColor: "divider", bgcolor: "rgba(255,255,255,.92)", backdropFilter: "blur(16px)" }}><Toolbar sx={{ minHeight: { xs: 62, md: 68 } }}><IconButton onClick={() => setMobileDrawer(true)} sx={{ display: { md: "none" }, mr: 1 }}><MenuRoundedIcon /></IconButton><Typography variant="h6" flex={1}>{viewTitles[view]}</Typography><Tooltip title="暂无新提醒"><IconButton><NotificationsNoneRoundedIcon /></IconButton></Tooltip><IconButton onClick={(event) => setAccountAnchor(event.currentTarget)}><Avatar sx={{ width: 34, height: 34, bgcolor: "primary.main", fontSize: 14 }}>{state.currentUser.displayName.slice(0, 1)}</Avatar></IconButton></Toolbar></AppBar>
    <Box component="main" sx={{ ml: { md: `${DRAWER_WIDTH}px` }, pt: { xs: "78px", md: "88px" }, pb: { xs: "96px", md: 5 }, px: { xs: 1.5, sm: 2.5, lg: 4 }, minHeight: "100vh" }}><Box sx={{ maxWidth: 1460, mx: "auto" }}>{content}</Box></Box>
    {mobile && <PaperMobileNav value={activeRoot} onChange={(next) => navigate(next)} />}
    {mobile && <SpeedDial ariaLabel="快捷新建" sx={{ position: "fixed", right: 18, bottom: 78 }} icon={<SpeedDialIcon />}><SpeedDialAction icon={<AddRoadRoundedIcon />} tooltipTitle="新建计划" onClick={() => openPlan()} /><SpeedDialAction icon={<HikingRoundedIcon />} tooltipTitle="记录行程" onClick={() => openRecord()} /></SpeedDial>}
    <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}><Box px={2} py={1} minWidth={220}><Typography fontWeight={750}>{state.currentUser.displayName}</Typography><Typography variant="caption" color="text.secondary">{state.currentUser.email}</Typography></Box><Divider /><MenuItem onClick={() => { navigate("backup"); setAccountAnchor(null); }}><BackupRoundedIcon fontSize="small" sx={{ mr: 1.2 }} />导出与备份</MenuItem><MenuItem component="a" href="https://github.com/jyxjjj/Friends-Climbing/tree/public-release/sites-v4" target="_blank" rel="noopener noreferrer"><CodeRoundedIcon fontSize="small" sx={{ mr: 1.2 }} />源代码 · AGPL-3.0-or-later</MenuItem></Menu>
    <MemberDialog open={memberDialog} member={editingMember} busy={busy} onClose={() => setMemberDialog(false)} onSave={saveMember} />
    <PlanDialog open={planDialog} plan={editingPlan} principal={state.currentUser.email} members={state.members} plans={state.plans} busy={busy} onClose={() => setPlanDialog(false)} onSave={savePlan} />
    <RecordDialog open={recordDialog} record={editingRecord} importedPlan={importedPlan} principal={state.currentUser.email} plans={state.plans} members={state.members} busy={busy} onClose={() => setRecordDialog(false)} onSave={saveRecord} />
    <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget?.title ?? "确认操作"} description={deleteTarget?.description ?? ""} busy={busy} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    <Snackbar open={Boolean(snack)} autoHideDuration={4200} onClose={() => setSnack(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}><Alert severity={snack?.severity ?? "success"} variant="filled" onClose={() => setSnack(null)}>{snack?.message}</Alert></Snackbar>
  </ThemeProvider>;
}

function PaperAccount({ state, onClick }: { state: AppState; onClick: (event: React.MouseEvent<HTMLElement>) => void }) {
  return <Button color="inherit" fullWidth onClick={onClick} sx={{ justifyContent: "flex-start", p: 1.1, borderRadius: 2.5, bgcolor: "#f2f5f3" }}><Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", mr: 1.2 }}>{state.currentUser.displayName.slice(0, 1)}</Avatar><Box textAlign="left" minWidth={0}><Typography variant="body2" fontWeight={750} noWrap>{state.currentUser.displayName}</Typography><Typography variant="caption" color="text.secondary" noWrap display="block">团队创建人</Typography></Box></Button>;
}

function PaperMobileNav({ value, onChange }: { value: ViewName; onChange: (view: ViewName) => void }) {
  const normalized = ["dashboard", "plans", "records", "members", "analytics"].includes(value) ? value : "dashboard";
  return <Box sx={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1200, borderTop: "1px solid", borderColor: "divider", bgcolor: "white" }}><BottomNavigation value={normalized} onChange={(_, next) => onChange(next)} showLabels sx={{ height: 66 }}><BottomNavigationAction value="dashboard" label="总览" icon={<DashboardRoundedIcon />} /><BottomNavigationAction value="plans" label="计划" icon={<RouteRoundedIcon />} /><BottomNavigationAction value="records" label="记录" icon={<HikingRoundedIcon />} /><BottomNavigationAction value="members" label="成员" icon={<GroupsRoundedIcon />} /><BottomNavigationAction value="analytics" label="统计" icon={<InsertChartRoundedIcon />} /></BottomNavigation></Box>;
}
