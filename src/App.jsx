import React, { useMemo, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Box, Typography, Paper, Button, Tab, Tabs, Chip } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

/* -------------------- 숫자 유틸 -------------------- */
const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).replace(/[, \t]/g, "").replace(/원|KRW|₩|%/gi, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};
const fmtInt = (n) =>
  n === null || n === undefined || isNaN(n) ? "" : Math.round(n).toLocaleString("ko-KR");
const fmtPct = (ratio) =>
  ratio === null || ratio === undefined || !isFinite(ratio) ? "" : (ratio * 100).toFixed(2);

/* -------------------- 헤더 매핑 -------------------- */
const getFrom = (row, keys) => {
  for (const k of keys) if (row.hasOwnProperty(k) && row[k] !== "" && row[k] != null) return row[k];
  return "";
};
const COL = {
  campaign: ["캠페인명", "캠페인", "campaign", "Campaign"],
  keyword: ["키워드", "키워드명", "검색 키워드", "keyword", "Keyword"],
  cost: ["광고비", "비용", "ad cost", "Ad cost", "Cost", "cost", "총 광고비"],
  sales14: ["총 전환매출액(14일)", "총전환매출액(14일)", "총 전환 매출액(14일)"],
  impressions: ["노출수", "노출", "impressions", "Impressions"],
  clicks: ["클릭수", "클릭", "clicks", "Clicks"],
};

/* -------------------- 메인 컴포넌트 -------------------- */
export default function App() {
  const [fileName, setFileName] = useState("");
  const [allRows, setAllRows] = useState([]); // 전체 데이터(ROAS<1, '-' 제외 반영)
  const [deletedMap, setDeletedMap] = useState({}); // 캠페인별 삭제된 데이터
  const [error, setError] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [activeTab, setActiveTab] = useState(""); // 활성 탭(캠페인명)

  /* 업로드 */
  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

        // 가공
        const processed = json
          .map((row, idx) => {
            const campaign = String(getFrom(row, COL.campaign) || "").trim();
            const keyword = String(getFrom(row, COL.keyword) || "").trim();
            if (keyword === "-") return null; // 비검색 영역 → 제외

            const cost = toNum(getFrom(row, COL.cost));
            const sales = toNum(getFrom(row, COL.sales14));
            const imp = toNum(getFrom(row, COL.impressions));
            const clk = toNum(getFrom(row, COL.clicks));
            const roasRatio = cost > 0 ? sales / cost : 0;
            const lossAmount = cost - sales;

            return {
              id: `${campaign}_${keyword}_${idx}_${Date.now()}`,
              캠페인명: campaign,
              키워드: keyword,
              광고비: cost,
              총전환매출액_14일: sales,
              노출수: imp,
              클릭수: clk,
              ROAS_배수: roasRatio,
              손실비용: lossAmount,
            };
          })
          .filter(Boolean)
          .filter((item) => {
            // ROAS 100% 미만이면서 손실비용이 0보다 큰 경우만 필터링
            return item.ROAS_배수 < 1 && item.손실비용 > 0;
          });

        // 캠페인 오름차순 → 손실비용 내림차순
        processed.sort((a, b) => {
          const byCamp = a.캠페인명.localeCompare(b.캠페인명, "ko");
          if (byCamp !== 0) return byCamp;
          return (b.손실비용 || 0) - (a.손실비용 || 0);
        });

        setAllRows(processed);
        setDeletedMap({});
        setFileName(file.name.replace(/\.(xlsx|xls|csv)$/i, ""));
        setError("");
        setSortConfig({ key: null, direction: "asc" });

        if (processed.length > 0) {
          const campaigns = [...new Set(processed.map((r) => r.캠페인명))];
          setActiveTab(campaigns[0]);
        }
      } catch (err) {
        console.error(err);
        setError("파일을 읽는 중 오류가 발생했습니다. (쿠팡 월간 광고보고서 원본인지 확인)");
      }
    };
    reader.readAsBinaryString(file);
  };

  /* 캠페인 목록, 현재 탭 데이터 */
  const campaigns = useMemo(() => [...new Set(allRows.map((r) => r.캠페인명))], [allRows]);

  const currentTabRows = useMemo(() => {
    const deleted = deletedMap[activeTab] || [];
    const deletedIds = new Set(deleted.map((d) => d.id));
    return allRows.filter((r) => r.캠페인명 === activeTab && !deletedIds.has(r.id));
  }, [allRows, activeTab, deletedMap]);

  /* 전체 남아있는(삭제되지 않은) 행들 & 절감액 합계 */
  const remainingRowsAll = useMemo(() => {
    return allRows.filter((row) => {
      const d = deletedMap[row.캠페인명] || [];
      return !d.some((x) => x.id === row.id);
    });
  }, [allRows, deletedMap]);

  const totalSavedLoss = useMemo(
    () => remainingRowsAll.reduce((s, r) => s + (r.손실비용 || 0), 0),
    [remainingRowsAll]
  );

  /* 정렬 */
  const handleSort = useCallback(
    (key) => {
      let direction = "asc";
      if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) return currentTabRows;
    return [...currentTabRows].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === "string") {
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal, "ko")
          : bVal.localeCompare(aVal, "ko");
      }
      return sortConfig.direction === "asc"
        ? (aVal || 0) - (bVal || 0)
        : (bVal || 0) - (aVal || 0);
    });
  }, [currentTabRows, sortConfig]);

  /* 삭제/복구 */
  const removeRow = useCallback((row) => {
    setDeletedMap((prev) => {
      const campaign = row.캠페인명;
      const existing = prev[campaign] || [];
      if (existing.some((r) => r.id === row.id)) return prev; // 중복 방지
      return { ...prev, [campaign]: [...existing, row] };
    });
  }, []);

  const restoreRow = useCallback((row) => {
    setDeletedMap((prev) => {
      const campaign = row.캠페인명;
      const existing = prev[campaign] || [];
      return { ...prev, [campaign]: existing.filter((r) => r.id !== row.id) };
    });
  }, []);

  /* 복사(현재 탭 남은 키워드) */
  const copyCurrentTabKeywords = () => {
    const keywords = sortedRows.map((r) => r.키워드).join("\n");
    navigator.clipboard
      .writeText(keywords)
      .then(() => alert(`${activeTab} 캠페인의 제외키워드 ${sortedRows.length}개가 복사되었습니다.`))
      .catch(() => alert("복사 실패: HTTPS 환경 또는 클립보드 권한이 필요할 수 있습니다."));
  };

  /* 삭제된 전체 */
  const allDeleted = useMemo(
    () => Object.entries(deletedMap).flatMap(([, items]) => items),
    [deletedMap]
  );

  /* 엑셀 다운로드 */
  const downloadExcel = () => {
    const pretty = remainingRowsAll.map((r) => ({
      캠페인명: r.캠페인명,
      키워드: r.키워드,
      손실비용: fmtInt(r.손실비용),
      광고비: fmtInt(r.광고비),
      "총전환매출액(14일)": fmtInt(r.총전환매출액_14일),
      노출수: fmtInt(r.노출수),
      클릭수: fmtInt(r.클릭수),
      "ROAS(%)": fmtPct(r.ROAS_배수),
    }));

    const prettyDeleted = allDeleted.map((r) => ({
      캠페인명: r.캠페인명,
      키워드: r.키워드,
      손실비용: fmtInt(r.손실비용),
      광고비: fmtInt(r.광고비),
      "총전환매출액(14일)": fmtInt(r.총전환매출액_14일),
      노출수: fmtInt(r.노출수),
      클릭수: fmtInt(r.클릭수),
      "ROAS(%)": fmtPct(r.ROAS_배수),
    }));

    const numericSheet = remainingRowsAll.map((r) => ({
      캠페인명: r.캠페인명,
      키워드: r.키워드,
      손실비용: r.손실비용,
      광고비: r.광고비,
      총전환매출액_14일: r.총전환매출액_14일,
      노출수: r.노출수,
      클릭수: r.클릭수,
      ROAS_배수: r.ROAS_배수,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pretty), "제외키워드(보기)");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prettyDeleted), "삭제목록(보기)");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(numericSheet), "NumericRaw");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const blob = new Blob([out], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName || "제외키워드"}_edited.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* 정렬 아이콘 */
  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <span style={{ opacity: 0.3, fontSize: 11 }}>↕</span>;
    return sortConfig.direction === "asc" ? (
      <span style={{ fontSize: 11 }}>↑</span>
    ) : (
      <span style={{ fontSize: 11 }}>↓</span>
    );
  };

  /* ---------- UI ---------- */
  return (
    <Box sx={{ p: { xs: 1, md: 2 }, bgcolor: "#fafcff", minHeight: "100vh" }}>
      {/* 헤더 */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <FilterListIcon sx={{ fontSize: 38, mr: 1, color: "#1976d2" }} />
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.25, color: "#000" }}>
          <span style={{ color: "#13185a", fontWeight: 900 }}>맨땅멘토</span>{" "}
          | 누수 점검 리포트: <span style={{ fontWeight: 800 }}>제외키워드 자동 선정</span>
        </Typography>
      </Box>

      {/* 본문 */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        {/* 왼쪽: 메인 */}
        <Box sx={{ flex: 1 }}>
          <Paper elevation={2} sx={{ mb: 2 }}>
            {/* 컨트롤 */}
            <Box sx={{ p: 2, borderBottom: "1px solid #e5e7eb" }}>
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
                <Button
                  variant="contained"
                  component="label"
                  startIcon={<UploadFileIcon />}
                  sx={{ bgcolor: "#1976d2", "&:hover": { bgcolor: "#1565c0" } }}
                >
                  파일 업로드
                  <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={onUpload} />
                </Button>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={downloadExcel}
                  disabled={!remainingRowsAll.length && !allDeleted.length}
                  sx={{ bgcolor: "#2e7d32", "&:hover": { bgcolor: "#1b5e20" } }}
                >
                  엑셀 다운로드
                </Button>
                <Button
                  variant="contained"
                  startIcon={<ContentCopyIcon />}
                  onClick={copyCurrentTabKeywords}
                  disabled={!sortedRows.length}
                  sx={{ bgcolor: "#000", "&:hover": { bgcolor: "#333" } }}
                >
                  현재 캠페인 키워드 복사
                </Button>
              </Box>

              {error && (
                <Typography sx={{ color: "#d32f2f", fontSize: 14, mb: 0.5 }}>{error}</Typography>
              )}
              <Typography sx={{ color: "#666", fontSize: 13 }}>
                • 쿠팡 월간 광고보고서(.xlsx) 업로드 → ROAS 100% 미만 & 손실 발생 키워드 자동 선별 · 캠페인별 손실 순 정렬
              </Typography>
            </Box>

            {/* 캠페인 탭 */}
            {campaigns.length > 0 && (
              <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                <Tabs
                  value={campaigns.indexOf(activeTab)}
                  onChange={(_, v) => setActiveTab(campaigns[v])}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ "& .MuiTab-root": { textTransform: "none", fontWeight: 600, minHeight: 48 } }}
                >
                  {campaigns.map((camp) => {
                    const del = deletedMap[camp] || [];
                    const remaining = allRows.filter(
                      (r) => r.캠페인명 === camp && !del.some((d) => d.id === r.id)
                    ).length;
                    return (
                      <Tab
                        key={camp}
                        label={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <span>{camp}</span>
                            <Chip
                              label={remaining}
                              size="small"
                              sx={{ bgcolor: "#e3f2fd", color: "#1976d2", fontSize: 11, height: 20 }}
                            />
                          </Box>
                        }
                      />
                    );
                  })}
                </Tabs>
              </Box>
            )}

            {/* 테이블 */}
            {campaigns.length > 0 ? (
              <Box sx={{ p: 2 }}>
                <Box
                  sx={{
                    overflow: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: 2,
                    bgcolor: "#fff",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc" }}>
                        {[
                          { key: "키워드", label: "키워드", minW: 200 },
                          { key: "손실비용", label: "손실비용", minW: 110 },
                          { key: "광고비", label: "광고비" },
                          { key: "총전환매출액_14일", label: "총전환매출액(14일)" },
                          { key: "노출수", label: "노출수" },
                          { key: "클릭수", label: "클릭수" },
                          { key: "ROAS_배수", label: "ROAS(%)" },
                        ].map((col) => (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            style={{
                              position: "sticky",
                              top: 0,
                              background: "#f8fafc",
                              padding: "12px 8px",
                              textAlign: "left",
                              cursor: "pointer",
                              borderBottom: "1px solid #e5e7eb",
                              fontWeight: 700,
                              minWidth: col.minW || 0,
                            }}
                          >
                            {col.label} <SortIcon column={col.key} />
                          </th>
                        ))}
                        <th
                          style={{
                            position: "sticky",
                            top: 0,
                            background: "#f8fafc",
                            padding: "12px 8px",
                            textAlign: "center",
                            borderBottom: "1px solid #e5e7eb",
                            fontWeight: 700,
                            minWidth: 90,
                          }}
                        >
                          작업
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((r, i) => (
                        <tr key={r.id} style={{ backgroundColor: i % 2 ? "#fafbfc" : "#fff" }}>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>{r.키워드}</td>
                          <td
                            style={{
                              padding: "10px 8px",
                              borderBottom: "1px solid #f0f0f0",
                              textAlign: "right",
                              color: "#d32f2f",
                              fontWeight: 700,
                            }}
                          >
                            {fmtInt(r.손실비용)}
                          </td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                            {fmtInt(r.광고비)}
                          </td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                            {fmtInt(r.총전환매출액_14일)}
                          </td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                            {fmtInt(r.노출수)}
                          </td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                            {fmtInt(r.클릭수)}
                          </td>
                          <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                            {fmtPct(r.ROAS_배수)}%
                          </td>
                          <td
                            style={{
                              padding: "10px 8px",
                              borderBottom: "1px solid #f0f0f0",
                              textAlign: "center",
                            }}
                          >
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<DeleteIcon />}
                              onClick={() => removeRow(r)}
                              sx={{
                                bgcolor: "#d32f2f",
                                "&:hover": { bgcolor: "#c62828" },
                                fontSize: 12,
                                minWidth: "auto",
                                px: 1,
                              }}
                            >
                              삭제
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!sortedRows.length && (
                        <tr>
                          <td colSpan={8} style={{ padding: "40px 20px", textAlign: "center", color: "#9ca3af" }}>
                            이 캠페인에는 제외할 키워드가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Box>

                <Typography sx={{ color: "#666", fontSize: 13, mt: 2 }}>
                  현재 캠페인: <strong>{activeTab}</strong> · 남은 키워드:{" "}
                  <strong>{sortedRows.length}개</strong> · 헤더 클릭으로 정렬 가능
                </Typography>
              </Box>
            ) : (
              <Box sx={{ p: 6, textAlign: "center", color: "#9ca3af" }}>
                <SearchIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                <Typography variant="h6" sx={{ mb: 1 }}>
                  파일을 업로드하여 시작하세요
                </Typography>
                <Typography sx={{ fontSize: 14 }}>
                  쿠팡 월간 광고보고서 파일(.xlsx)을 업로드하면
                  <br />
                  ROAS 100% 미만인 키워드를 자동으로 분석합니다.
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>

        {/* 오른쪽: 사이드 (삭제목록 + 절감액 박스) */}
        <Box sx={{ width: 340, position: "sticky", top: 16 }}>
          {/* 삭제 목록 */}
          <Paper elevation={2} sx={{ mb: 2, maxHeight: "58vh", display: "flex", flexDirection: "column" }}>
            <Box sx={{ p: 2, borderBottom: "1px solid #e5e7eb" }}>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, display: "flex", alignItems: "center", mb: 1 }}
              >
                <DeleteIcon sx={{ mr: 1, color: "#d32f2f" }} />
                삭제한 키워드 ({allDeleted.length}개)
              </Typography>
              <Typography sx={{ color: "#666", fontSize: 13 }}>클릭하여 제외 목록으로 복구</Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: "auto", p: Object.entries(deletedMap).length === 0 ? 0 : 1 }}>
              {Object.entries(deletedMap).length === 0 ? (
                <Box sx={{ p: 4, textAlign: "center", color: "#9ca3af" }}>
                  <RestoreIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
                  <Typography>삭제한 키워드가 없습니다.</Typography>
                </Box>
              ) : (
                Object.entries(deletedMap).map(([camp, items]) => {
                  if (!items || items.length === 0) return null;
                  return (
                    <Box key={camp} sx={{ mb: 2 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          mb: 1,
                          px: 1,
                        }}
                      >
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                          {camp}
                        </Typography>
                        <Chip
                          label={`${items.length}개`}
                          size="small"
                          sx={{ bgcolor: "#fef3c7", color: "#92400e", fontSize: 11, height: 20 }}
                        />
                      </Box>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 1 }}>
                        {items.map((item) => (
                          <Chip
                            key={item.id}
                            label={item.키워드}
                            size="small"
                            clickable
                            onClick={() => restoreRow(item)}
                            sx={{
                              bgcolor: "#f9fafb",
                              border: "1px solid #e5e7eb",
                              fontSize: 12,
                              height: 28,
                              "&:hover": {
                                bgcolor: "#10b981",
                                color: "white",
                                borderColor: "#10b981",
                                transform: "translateY(-1px)",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                              },
                              transition: "all 0.2s",
                            }}
                            title={`클릭하여 복구\nROAS: ${fmtPct(item.ROAS_배수)}%\n손실: ${fmtInt(
                              item.손실비용
                            )}원`}
                          />
                        ))}
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>
          </Paper>

          {/* 절감액 박스 - 세련된 디자인 */}
          <Paper 
            elevation={3}
            sx={{ 
              p: 3,
              bgcolor: "#080a27",
              position: "relative",
              overflow: "hidden",
              border: "2px solid #1976d2",
            }}
          >
            {/* 상단 액센트 라인 */}
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: "#1976d2",
              }}
            />

            {/* 콘텐츠 */}
            <Box sx={{ position: "relative", zIndex: 1 }}>
              {/* 상단 제목과 키워드 수 */}
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ color: "#1976d2", fontSize: 11, fontWeight: 600, letterSpacing: 1, mb: 0.5 }}>
                  ESTIMATED SAVINGS
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                  <Typography sx={{ color: "#fff", fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
                    예상 누수액 절감
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography sx={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                      제외키워드
                    </Typography>
                    <Typography sx={{ color: "#1976d2", fontSize: 14, fontWeight: 700 }}>
                      {remainingRowsAll.length}개
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* 메인 금액 박스 */}
              <Box sx={{ mb: 3 }}>
                <Box 
                  sx={{ 
                    p: 3, 
                    bgcolor: "rgba(25,118,210,0.08)",
                    borderRadius: 2,
                    border: "1px solid rgba(25,118,210,0.2)",
                    textAlign: "center"
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: 12, mb: 1.5, fontWeight: 500 }}>
                    이번 달 예상 절감액
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                    <Typography
                      sx={{
                        fontSize: 48,
                        fontWeight: 900,
                        color: "#fff",
                        letterSpacing: "-2px",
                        lineHeight: 1,
                        textShadow: "0 0 20px rgba(25,118,210,0.3)",
                      }}
                    >
                      {fmtInt(totalSavedLoss)}
                    </Typography>
                    <Typography sx={{ fontSize: 24, color: "rgba(255,255,255,0.6)", ml: 1.5, fontWeight: 400 }}>
                      원
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* 강조 메시지 */}
              <Box
                sx={{
                  bgcolor: "#1976d2",
                  borderRadius: 1,
                  p: 2,
                  textAlign: "center",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
                  <TrendingDownIcon sx={{ color: "#fff", fontSize: 20 }} />
                  <Typography sx={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
                    매월 이만큼의 광고비가 절감됩니다
                  </Typography>
                </Box>
              </Box>

              {/* 하단 설명 */}
              <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: 11, mt: 2, textAlign: "center" }}>
                업로드된 기간 기준 · 제외 예정 키워드의 손실비용 합계
              </Typography>
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}