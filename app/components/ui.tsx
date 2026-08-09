"use client";

import React from "react";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
  alpha,
  createTheme,
} from "@mui/material";
import LandscapeRoundedIcon from "@mui/icons-material/LandscapeRounded";
import type { Difficulty, Member } from "../lib/models";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1f5d4a", dark: "#153c32", light: "#5f8f7e" },
    secondary: { main: "#ed8240", dark: "#bf5c25" },
    background: { default: "#f3f6f2", paper: "#ffffff" },
    text: { primary: "#1d2925", secondary: "#68766f" },
    divider: "#dfe7e2",
    success: { main: "#2e7d5b" },
    warning: { main: "#c76a2a" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    h1: { fontWeight: 750, letterSpacing: "-0.035em" },
    h2: { fontWeight: 720, letterSpacing: "-0.025em" },
    h3: { fontWeight: 700, letterSpacing: "-0.02em" },
    h4: { fontWeight: 700, letterSpacing: "-0.015em" },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 680 },
    button: { textTransform: "none", fontWeight: 650 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10, minHeight: 42, paddingInline: 18 } },
    },
    MuiCard: {
      styleOverrides: { root: { border: "1px solid #e1e8e4", boxShadow: "0 8px 28px rgba(29, 52, 43, 0.055)", borderRadius: 16 } },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 18 } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: "#fff" } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 650 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});

export function TrailLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Stack direction="row" spacing={1.2} alignItems="center">
      <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: "primary.main", color: "white", display: "grid", placeItems: "center", boxShadow: "0 8px 18px rgba(31,93,74,.26)" }}>
        <LandscapeRoundedIcon />
      </Box>
      {!compact && (
        <Box>
          <Typography variant="h6" sx={{ lineHeight: 1.05, letterSpacing: "-.02em" }}>山行账本</Typography>
          <Typography variant="caption" color="text.secondary">Summit ledger</Typography>
        </Box>
      )}
    </Stack>
  );
}

const difficultyStyles: Record<Difficulty, { bg: string; color: string }> = {
  休闲: { bg: "#e3f2ec", color: "#257052" },
  进阶: { bg: "#e4eefb", color: "#315f9a" },
  速穿: { bg: "#fff0e5", color: "#b85e23" },
  重装: { bg: "#efe7f8", color: "#78509a" },
};

export function DifficultyChip({ value, size = "small" }: { value: Difficulty; size?: "small" | "medium" }) {
  const style = difficultyStyles[value] ?? difficultyStyles.休闲;
  return <Chip label={value} size={size} sx={{ bgcolor: style.bg, color: style.color }} />;
}

export function MemberAvatar({ member, size = 34 }: { member?: Member; size?: number }) {
  const palette = ["#1f5d4a", "#547b91", "#9b6a4a", "#77628c", "#8c6c39"];
  const index = member ? [...member.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length : 0;
  return (
    <Avatar sx={{ width: size, height: size, bgcolor: palette[index], fontSize: size * 0.38, fontWeight: 700 }}>
      {member?.nickname?.slice(0, 1) ?? "山"}
    </Avatar>
  );
}

export function KpiCard({ label, value, unit, icon, hint, tint = "#1f5d4a" }: { label: string; value: string | number; unit?: string; icon: React.ReactNode; hint?: string; tint?: string }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: { xs: 2, md: 2.4 }, "&:last-child": { pb: { xs: 2, md: 2.4 } } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>
            <Stack direction="row" spacing={0.6} alignItems="baseline" mt={1.1}>
              <Typography variant="h4" sx={{ fontSize: { xs: 25, md: 30 }, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
              {unit && <Typography variant="body2" color="text.secondary">{unit}</Typography>}
            </Stack>
            {hint && <Typography variant="caption" color="text.secondary" display="block" mt={0.8}>{hint}</Typography>}
          </Box>
          <Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: "grid", placeItems: "center", bgcolor: alpha(tint, 0.11), color: tint }}>{icon}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "flex-end" }} spacing={2} mb={3}>
      <Box>
        {eyebrow && <Typography variant="overline" color="primary.main" fontWeight={800} letterSpacing=".12em">{eyebrow}</Typography>}
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 26, md: 32 } }}>{title}</Typography>
        {description && <Typography color="text.secondary" mt={0.7}>{description}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card sx={{ minHeight: 300, display: "grid", placeItems: "center", textAlign: "center" }}>
      <CardContent>
        <Box sx={{ width: 64, height: 64, bgcolor: "#e8f0ec", color: "primary.main", borderRadius: 4, display: "grid", placeItems: "center", mx: "auto", mb: 2 }}><LandscapeRoundedIcon fontSize="large" /></Box>
        <Typography variant="h6">{title}</Typography>
        <Typography color="text.secondary" mt={0.7} mb={2.2}>{description}</Typography>
        {action}
      </CardContent>
    </Card>
  );
}

export function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

export function formatPace(minutes: number, distance: number) {
  if (!distance) return "—";
  const totalSeconds = Math.round((minutes * 60) / distance);
  const mins = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${mins}'${String(seconds).padStart(2, "0")}\"/km`;
}

export function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value || 0);
}

export function dateLabel(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}
