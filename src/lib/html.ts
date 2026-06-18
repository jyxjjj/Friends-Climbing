export const csp = [
  "default-src 'self'",
  "script-src 'self' 'nonce-friends-climbing-app' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Friends Climbing</title>
    <link
      href="https://fonts.googleapis.com/icon?family=Material+Icons"
      rel="stylesheet"
    />
    <script
      crossorigin="anonymous"
      integrity="sha384-tMH8h3BGESGckSAVGZ82T9n90ztNXxvdwvdM6UoR56cYcf+0iGXBliJ29D+wZ/x8"
      src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"
    ></script>
    <script
      crossorigin="anonymous"
      integrity="sha384-bm7MnzvK++ykSwVJ2tynSE5TRdN+xL418osEVF2DE/L/gfWHj91J2Sphe582B1Bh"
      src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"
    ></script>
    <script
      crossorigin="anonymous"
      integrity="sha384-bs/nf9FbdNouRbMiFcrcZfLXYPKiPaGVGplVbv7dLGECccEXDW+S3zjqSKR5ZEaD"
      src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
    ></script>
    <style>
      :root {
        --p: #1976d2;
        --bg: #f5f5f5;
        --e: #d32f2f;
      }
      body {
        margin: 0;
        font-family: Roboto, Arial, "Microsoft YaHei", sans-serif;
        background: var(--bg);
        color: #222;
      }
      .appbar {
        background: var(--p);
        color: white;
        padding: 12px 18px;
        display: flex;
        gap: 16px;
        align-items: center;
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .brand {
        font-size: 20px;
        font-weight: 500;
      }
      .nav {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .nav button,
      .appbar button {
        color: white;
        background: transparent;
        border: 0;
        padding: 8px;
        border-radius: 4px;
      }
      .nav button:hover {
        background: #ffffff22;
      }
      .wrap {
        max-width: 1200px;
        margin: 18px auto;
        padding: 0 12px;
      }
      .card {
        background: white;
        border-radius: 4px;
        box-shadow: 0 2px 4px #0003;
        margin: 12px 0;
        padding: 16px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      input,
      select,
      textarea {
        box-sizing: border-box;
        width: 100%;
        padding: 10px;
        border: 1px solid #bbb;
        border-radius: 4px;
        margin: 4px 0 10px;
        background: white;
      }
      label {
        font-size: 12px;
        color: #555;
      }
      .err {
        border-color: var(--e) !important;
      }
      .btn {
        background: var(--p);
        color: white;
        border: 0;
        padding: 10px 14px;
        border-radius: 4px;
        margin: 4px;
        cursor: pointer;
      }
      .danger {
        background: #d32f2f;
      }
      .muted {
        color: #777;
      }
      .table {
        width: 100%;
        border-collapse: collapse;
      }
      .table td,
      .table th {
        padding: 8px;
        border-bottom: 1px solid #eee;
        text-align: left;
      }
      .photo {
        max-width: 180px;
        max-height: 120px;
        margin: 6px;
        cursor: pointer;
      }
      @media (max-width: 700px) {
        .appbar {
          display: block;
        }
        .nav {
          margin-top: 8px;
        }
        .table {
          font-size: 13px;
        }
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="friends-climbing-app">
      const e = React.createElement,
        { useState, useEffect, useRef } = React;
      const cats = ["油费", "过路费", "停车费", "午餐", "补给", "门票", "其他"],
        diff = ["休闲", "进阶", "速穿", "重装"];
      async function api(p, o = {}) {
        const r = await fetch("/api" + p, {
          headers: { "Content-Type": "application/json" },
          ...o,
        });
        const j = await r
          .json()
          .catch(() => ({ ok: false, error: "响应错误" }));
        if (!j.ok) throw Error(j.error);
        return j.data;
      }
      const money = (c) => (c / 100).toFixed(2),
        cents = (v) => Math.round(Number(v || 0) * 100);
      function Field({ o, set, k, label, type = "text", req = false }) {
        let bad = req && !o[k];
        return e(
          "div",
          null,
          e("label", null, label),
          e(type === "textarea" ? "textarea" : "input", {
            className: bad ? "err" : "",
            type: type === "number" ? "number" : type,
            checked: type === "checkbox" ? Boolean(o[k]) : undefined,
            value: type === "checkbox" ? undefined : (o[k] ?? ""),
            onChange: (x) =>
              set({
                ...o,
                [k]: type === "checkbox" ? x.target.checked :
                  type === "number" ? Number(x.target.value) : x.target.value,
              }),
          }),
        );
      }
      function Login({ setUser }) {
        const [f, setF] = useState({ username: "", password: "" }),
          [m, setM] = useState("");
        return e(
          "div",
          { className: "wrap" },
          e(
            "div",
            { className: "card" },
            e("h2", null, "登录"),
            e(Field, { o: f, set: setF, k: "username", label: "账号" }),
            e(Field, {
              o: f,
              set: setF,
              k: "password",
              label: "密码",
              type: "password",
            }),
            e(
              "button",
              {
                className: "btn",
                onClick: async () => {
                  try {
                    await api("/login", {
                      method: "POST",
                      body: JSON.stringify(f),
                    });
                    setUser(await api("/me"));
                  } catch (x) {
                    setM(x.message);
                  }
                },
              },
              "登录",
            ),
            e(
              "p",
              { className: "muted" },
              "首次部署后请用 README 中的初始化接口创建 Owner。",
            ),
            e("b", null, m),
          ),
        );
      }
      function App() {
        const [user, setUser] = useState(null),
          [page, setPage] = useState("dashboard"),
          [id, setId] = useState("");
        useEffect(() => {
          api("/me")
            .then(setUser)
            .catch(() => setUser(false));
        }, []);
        if (user === null) return "Loading...";
        if (!user) return e(Login, { setUser });
        const nav = [
          "dashboard",
          "users",
          "members",
          "templates",
          "plans",
          "records",
          "export",
          "settings",
        ];
        return e(
          React.Fragment,
          null,
          e(
            "div",
            { className: "appbar" },
            e("span", { className: "brand" }, "Friends Climbing"),
            e(
              "div",
              { className: "nav" },
              nav.map((n) =>
                e(
                  "button",
                  {
                    onClick: () => {
                      setPage(n);
                      setId("");
                    },
                  },
                  name(n),
                ),
              ),
            ),
            e(
              "button",
              {
                onClick: async () => {
                  await api("/logout", { method: "POST" });
                  setUser(false);
                },
              },
              "登出 " + user.username,
            ),
          ),
          e(
            "div",
            { className: "wrap" },
            page === "dashboard"
              ? e(Dash)
              : page === "users"
                ? e(Users)
                : page === "members"
                  ? e(Members, { id, setId })
                  : page === "templates"
                  ? e(Templates)
                  : page === "plans"
                    ? e(Plans, { id, setId })
                    : page === "records"
                      ? e(Records, { id, setId })
                      : page === "export"
                        ? e(Export)
                        : e(Settings, { user }),
          ),
        );
      }
      function name(n) {
        return {
          dashboard: "Dashboard",
          users: "用户",
          members: "成员",
          templates: "路线模板",
          plans: "计划",
          records: "记录",
          export: "数据导出",
          settings: "设置",
        }[n];
      }
      function normalizeListResponse(data) {
        if (Array.isArray(data)) return { items: data, nextCursor: null, hasMore: false };
        if (data && typeof data === "object") return {
          items: Array.isArray(data.items) ? data.items : [],
          nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
          hasMore: data.hasMore === true,
        };
        return { items: [], nextCursor: null, hasMore: false };
      }
      function useList(path) {
        const [page, setPage] = useState({ items: [], nextCursor: null, hasMore: false });
        const load = (cursor) => api(path + (cursor ? "?cursor=" + encodeURIComponent(cursor) : "")).then((d) => { const n = normalizeListResponse(d); setPage(n); return n; });
        const refresh = () => load();
        useEffect(() => { refresh(); }, [path]);
        return [page.items, load, page, refresh];
      }
      function Dash() {
        const [d, setD] = useState(null), chartRef = useRef(null);
        useEffect(() => {
          api("/dashboard").then(setD);
        }, []);
        useEffect(() => {
          if (d && window.Chart) {
            setTimeout(() => {
              let c = document.getElementById("trend");
              if (c) {
                if (chartRef.current) chartRef.current.destroy();
                chartRef.current = new Chart(c, {
                  type: "line",
                  data: {
                    labels: d.monthly.map((x) => x.period),
                    datasets: [
                      {
                        label: "里程",
                        data: d.monthly.map((x) => x.distanceKm),
                      },
                      {
                        label: "爬升",
                        data: d.monthly.map((x) => x.elevationM),
                      },
                      {
                        label: "费用",
                        data: d.monthly.map((x) => x.costCents / 100),
                      },
                    ],
                  },
                });
              }
            }, 100);
            return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
          }
        }, [d]);
        if (!d) return "...";
        return e(
          "div",
          null,
          e(
            "div",
            { className: "grid" },
            [
              ["累计总里程", d.totalDistanceKm + " km"],
              ["累计总爬升", d.totalElevationM + " m"],
              ["累计总时长", d.totalDurationMin + " min"],
              ["总出行次数", d.totalTrips],
              ["总费用", money(d.totalCostCents)],
            ].map((x) =>
              e(
                "div",
                { className: "card" },
                e("h3", null, x[0]),
                e("h2", null, x[1]),
              ),
            ),
          ),
          e("div", { className: "card" }, e("canvas", { id: "trend" })),
          e(
            "div",
            { className: "card" },
            e("h3", null, "成员排行榜"),
            d.memberRankings.map((r) =>
              e(
                "p",
                null,
                r.memberId +
                  " 里程 " +
                  r.distanceKm +
                  " 爬升 " +
                  r.elevationM +
                  " 次数 " +
                  r.participations,
              ),
            ),
          ),
        );
      }
      function Users() {
        const [list, load, page, refresh] = useList("/users"), [f, setF] = useState({ username: "", password: "", role: "Member", nickname: "", realName: "", baseWeightKg: "", baseBodyFatPct: "", gearNotes: "", disabled: false });
        return e(Crud, { title: "用户管理", list, load, page, refresh, path: "/users", f, setF, cols: ["username", "role", "memberId", "disabled"], fields: ["username", "password", "role", "nickname", "realName", "baseWeightKg", "baseBodyFatPct", "gearNotes", "disabled"] });
      }
      function Members() {
        const [list, load, page, refresh] = useList("/members"), [sel, setSel] = useState(null);
        if (sel) return e(Detail, { id: sel, back: () => setSel(null) });
        return e("div", { className: "card" }, e("h2", null, "成员只读列表"), e("button", { className: "btn", onClick: refresh }, "刷新"), e("button", { className: "btn", disabled: !page.hasMore, onClick: () => load(page.nextCursor) }, "下一页"), e("table", { className: "table" }, e("tbody", null, (Array.isArray(list) ? list : []).map((m) => e("tr", { key: m.id }, e("td", null, m.nickname || m.username), e("td", null, m.realName || ""), e("td", null, String(m.baseWeightKg ?? "")), e("td", null, e("button", { className: "btn", onClick: () => setSel(m.id) }, "详情"))))));
      }
      function Detail({ id, back }) {
        const [d, setD] = useState(null);
        useEffect(() => {
          api("/members/" + id + "/detail").then(setD).catch((x) => setD({ error: x.message }));
        }, [id]);
        if (!d) return "...";
        if (d.error || !d.member) return e("div", { className: "card" }, e("button", { className: "btn", onClick: back }, "返回"), e("b", null, d.error || "成员不存在"));
        return e(
          "div",
          { className: "card" },
          e("button", { className: "btn", onClick: back }, "返回"),
          e("h2", null, d.member.nickname),
          e(
            "p",
            null,
            "累计里程 " +
              d.stats.distance +
              " km，累计爬升 " +
              d.stats.elev +
              " m，参与 " +
              d.stats.count +
              " 次，平均配速 " +
              d.stats.pace +
              " min/km，平均速度 " +
              d.stats.speed +
              " km/h",
          ),
          e("h3", null, "全部参与记录"),
          d.records.map((r) => e("p", null, r.date + " " + r.routeName)),
        );
      }
      function Templates() {
        const [list, load, page, refresh] = useList("/templates"),
          [f, setF] = useState({
            name: "",
            defaultDifficulty: "休闲",
            defaultDistanceKm: 0,
            defaultDurationMin: 0,
            defaultElevationM: 0,
            dangerPoints: "",
            waterPoints: "",
            notes: "",
          });
        return e(Crud, {
          title: "路线模板列表",
          list,
          load,
          page,
          refresh,
          path: "/templates",
          f,
          setF,
          cols: [
            "name",
            "defaultDifficulty",
            "defaultDistanceKm",
            "defaultElevationM",
          ],
        });
      }
      function Plans() {
        const [list, load, page, refresh] = useList("/plans"),
          [f, setF] = useState({
            routeName: "",
            difficulty: "休闲",
            planDate: "",
            plannedDistanceKm: 0,
            plannedDurationMin: 0,
            plannedElevationM: 0,
            memberIds: [],
            budget: {},
            gearList: "",
            dangerPoints: "",
            waterPoints: "",
          });
        return e(Crud, {
          title: "计划列表/编辑/详情",
          list,
          load,
          page,
          refresh,
          path: "/plans",
          f,
          setF,
          cols: ["routeName", "difficulty", "planDate", "plannedDistanceKm"],
          after: (o) =>
            e(
              "button",
              {
                className: "btn",
                onClick: async () => {
                  await api("/records/from-plan/" + o.id, { method: "POST" });
                  alert("已生成记录");
                },
              },
              "生成记录",
            ),
        });
      }
      function Records() {
        const [list, load, page, refresh] = useList("/records"),
          [f, setF] = useState({
            routeName: "",
            difficulty: "休闲",
            date: "",
            memberIds: [],
            actualDistanceKm: 0,
            actualDurationMin: 0,
            actualElevationM: 0,
            budget: {},
            expenses: [],
            bodyData: [],
            roadNotes: "",
            riskNotes: "",
            weather: "",
            review: "",
            otherNotes: "",
          });
        return e(
          React.Fragment,
          null,
          e(Crud, {
            title: "历史记录/记录编辑",
            list,
            load,
            page,
            refresh,
            path: "/records",
            f,
            setF,
            cols: ["routeName", "date", "actualDistanceKm", "actualElevationM"],
            after: (o) =>
              e(
                "a",
                { href: "/api/export/record/" + o.id + "?format=json" },
                "导出",
              ),
          }),
          e(
            "div",
            { className: "card" },
            e("h3", null, "图片管理"),
            e(
              "p",
              null,
              "在记录详情中使用 /api/records/{id}/images 批量上传、删除、备注、分类筛选、下载。",
            ),
          ),
        );
      }
      function Crud({ title, list, load, page, refresh, path, f, setF, cols, after, fields }) {
        const [edit, setEdit] = useState(null),
          [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
        const rows = Array.isArray(list) ? list : [];
        useEffect(() => {
          try {
            const d = localStorage.getItem("draft:new:" + path);
            if (d && !f.id) setF({ ...f, ...JSON.parse(d) });
          } catch {}
        }, []);
        const obj = edit || f;
        const set = (o) => {
          edit ? setEdit(o) : setF(o);
          try {
            localStorage.setItem("draft:" + (edit ? "edit:" + path + ":" + edit.id : "new:" + path), JSON.stringify(o));
          } catch {}
        };
        return e(
          "div",
          null,
          e(
            "div",
            { className: "card" },
            e("h2", null, title),
            (fields || [
              "routeName",
              "name",
              "nickname",
              "realName",
              "planDate",
              "date",
              "defaultDistanceKm",
              "plannedDistanceKm",
              "actualDistanceKm",
              "defaultDurationMin",
              "plannedDurationMin",
              "actualDurationMin",
              "defaultElevationM",
              "plannedElevationM",
              "actualElevationM",
              "gearNotes",
              "dangerPoints",
              "waterPoints",
              "notes",
              "roadNotes",
              "riskNotes",
              "weather",
              "review",
              "otherNotes",
            ]).map((k) =>
              k in obj
                ? e(Field, {
                    key: k,
                    o: obj,
                    set,
                    k,
                    label: k,
                    type:
                      k === "disabled" ? "checkbox" : k === "password" ? "password" : k === "planDate" || k === "date" ? "date" : k.includes("Notes") || k === "review"
                        ? "textarea"
                        : k.includes("Km") ||
                            k.includes("Min") ||
                            k.includes("M") ||
                            k.includes("Weight") || k.includes("Pct")
                          ? "number"
                          : "text",
                  })
                : null,
            ),
            ("difficulty" in obj || "defaultDifficulty" in obj) &&
              e(
                "select",
                {
                  value: obj.difficulty || obj.defaultDifficulty,
                  onChange: (x) =>
                    set({
                      ...obj,
                      ["difficulty" in obj
                        ? "difficulty"
                        : "defaultDifficulty"]: x.target.value,
                    }),
                },
                diff.map((d) => e("option", { key: d }, d)),
              ),
            e(
              "button",
              {
                className: "btn", disabled: busy,
                onClick: async () => {
                  if (busy) return; setBusy(true);
                  try {
                    await api(path + (obj.id || obj.username && path === "/users" ? "/" + (obj.id || obj.username) : ""), {
                      method: obj.id || obj.username && path === "/users" && edit ? "PUT" : "POST",
                      body: JSON.stringify(obj),
                    });
                    setMsg("已保存");
                    localStorage.removeItem("draft:" + (obj.id ? "edit:" + path + ":" + obj.id : "new:" + path));
                    setEdit(null); setF(f);
                    load();
                  } catch (x) {
                    setMsg(x.message);
                  } finally { setBusy(false); }
                },
              },
              busy ? "保存中..." : "保存",
            ),
            e("span", null, msg),
          ),
          e(
            "div",
            { className: "card" },
            e(
              "table",
              { className: "table" },
              e(
                "tbody",
                null,
                rows.map((o) =>
                  e(
                    "tr",
                    { key: o.id || o.username },
                    cols.map((c) => e("td", { key: c }, String(o[c] ?? ""))),
                    e(
                      "td",
                      null,
                      path !== "/members" && e(
                        "button",
                        { className: "btn", onClick: () => setEdit(o) },
                        "编辑",
                      ),
                      path !== "/users" && path !== "/members" && e(
                        "button",
                        {
                          className: "btn danger", disabled: busy,
                          onClick: async () => {
                            if (!confirm("确认删除？")) return;
                            await api(path + "/" + o.id + "?version=" + encodeURIComponent(o.version || 0), { method: "DELETE" });
                            load();
                          },
                        },
                        "删除",
                      ),
                      after && after(o),
                    ),
                  ),
                ),
              ),
            ),
            e("button", { className: "btn", onClick: refresh || load }, "刷新"),
            e("button", { className: "btn", disabled: !(page && page.hasMore), onClick: () => load(page && page.nextCursor) }, "下一页"),
          ),
        );
      }
      function Export() {
        return e(
          "div",
          { className: "card" },
          e("h2", null, "数据导出"),
          ["csv", "xlsx", "json", "jsonc", "jsonl", "mysql", "mariadb"].map(
            (f) =>
              e(
                "a",
                { className: "btn", href: "/api/export/all?format=" + f },
                f.toUpperCase(),
              ),
          ),
        );
      }
      function Settings({ user }) {
        return e(
          "div",
          { className: "card" },
          e("h2", null, "设置"),
          e("p", null, "当前账号 " + user.username + "，角色 " + user.role),
          e(
            "p",
            null,
            "Owner 全部权限；Member 查看权限；创建者可编辑自身计划和记录。",
          ),
          e(
            "p",
            null,
            e("a", { href: "https://github.com/jyxjjj/Friends-Climbing", target: "_blank", rel: "noopener noreferrer" }, "AGPL-3.0-or-later 源码仓库"),
          ),
        );
      }
      ReactDOM.createRoot(document.getElementById("root")).render(e(App));
    </script>
  </body>
</html>`;
