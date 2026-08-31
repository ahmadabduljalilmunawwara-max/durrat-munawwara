import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType, auth } from "../lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { format } from "date-fns";
import {
  TrendingUp,
  Users,
  Bus,
  Calendar,
  Download,
  Loader2,
  ArrowUpRight,
  Activity,
  Clock,
  FileText,
  LayoutDashboard,
  Edit2,
  Trash2,
  X,
  Save,
  AlertTriangle,
  CheckCircle2,
  Archive,
  FolderArchive,
  Sparkles,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  AreaChart,
  Area,
} from "recharts";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../App";

export function Dashboard() {
  const { user: sessionUser } = useAuth();
  
  // Hajj Seasons State
  const [selectedSeason, setSelectedSeason] = useState<"1448" | "1447">("1448");
  const [activeAppSeason, setActiveAppSeason] = useState<string>("1448");
  const [isSeasonArchiveModalOpen, setIsSeasonArchiveModalOpen] = useState(false);
  const [isSeasonArchiveSuccessModalOpen, setIsSeasonArchiveSuccessModalOpen] = useState(false);
  const [isSeasonArchiving, setIsSeasonArchiving] = useState(false);
  const [seasonArchiveResult, setSeasonArchiveResult] = useState<{ totalArchived: number }>({ totalArchived: 0 });

  const [todayCount, setTodayCount] = useState(0);
  const [totalBuses, setTotalBuses] = useState(0);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [averageWeekly, setAverageWeekly] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isExportingStats, setIsExportingStats] = useState(false);
  const [isExportingAllStats, setIsExportingAllStats] = useState(false);
  const [isExportingApprovalBuses, setIsExportingApprovalBuses] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Edit/Delete State
  const [editingVoucher, setEditingVoucher] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [voucherToDelete, setVoucherToDelete] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canManage =
    sessionUser?.role === "general_manager" ||
    sessionUser?.role === "supervisor" ||
    auth.currentUser?.email === "ahmad.abduljalilmunawwara@gmail.com";

  const [filterMode, setFilterMode] = useState<"all" | "today">("all");
  const [tableSearchTerm, setTableSearchTerm] = useState("");

  // New States for Archiving
  const [dashboardTab, setDashboardTab] = useState<"analytics" | "archiving">(
    "analytics",
  );
  const [archiveTargetDate, setArchiveTargetDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [archiveMode, setArchiveMode] = useState<"exact" | "older">("older");
  const [matchingVouchers, setMatchingVouchers] = useState<any[]>([]);
  const [isArchivingInProgress, setIsArchivingInProgress] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isArchiveSuccessModalOpen, setIsArchiveSuccessModalOpen] =
    useState(false);
  const [isArchiveErrorModalOpen, setIsArchiveErrorModalOpen] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [archiveErrorMsg, setArchiveErrorMsg] = useState("");

  // New States and Types for Interactive Distributed Buses Tracker
  const [activeVouchers, setActiveVouchers] = useState<any[]>([]);
  const [distributedBusesToday, setDistributedBusesToday] = useState<any[]>([]);
  const [distributedBusesOverall, setDistributedBusesOverall] = useState<any[]>(
    [],
  );
  const [distributedBusesStartDate, setDistributedBusesStartDate] =
    useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [distributedBusesEndDate, setDistributedBusesEndDate] =
    useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [isBusDetailModalOpen, setIsBusDetailModalOpen] = useState(false);
  const [busDetailModalMode, setBusDetailModalMode] = useState<
    "today" | "overall"
  >("today");
  const [busModalSearchTerm, setBusModalSearchTerm] = useState("");

  // Listen to Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "app"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.activeSeason) {
          setActiveAppSeason(d.activeSeason);
        }
      }
    });
    return unsub;
  }, []);

  // Dynamic Real-time Snapshot for All Vouchers
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "vouchers"),
      (snap) => {
        const list: any[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({ id: docSnap.id, ...data });
        });
        // Sort by timestamp desc
        list.sort((a, b) => {
          const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return tB - tA;
        });
        setActiveVouchers(list);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error listening to vouchers:", error);
        setIsLoading(false);
      },
    );

    const unsubBuses = onSnapshot(collection(db, "buses"), (snap) => {
      setTotalBuses(snap.size);
    });

    return () => {
      unsub();
      unsubBuses();
    };
  }, []);

  // Compute counts per season
  const season1448Count = activeVouchers.filter(v => v.hajjSeason === "1448").length;
  const season1447Count = activeVouchers.filter(v => v.hajjSeason === "1447" || (!v.hajjSeason && v.archived === true) || !v.hajjSeason).length;
  const totalAllSeasonsCount = activeVouchers.length;

  // Filter vouchers based on selected season
  const seasonFilteredVouchers = React.useMemo(() => {
    return activeVouchers.filter((v) => {
      if (selectedSeason === "1448") {
        return v.hajjSeason === "1448";
      }
      return v.hajjSeason === "1447" || (!v.hajjSeason && v.archived === true) || !v.hajjSeason;
    });
  }, [activeVouchers, selectedSeason]);

  // Compute stats reactively based on seasonFilteredVouchers
  useEffect(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    
    // Today count
    const tCount = seasonFilteredVouchers.filter((v) => {
      const dKey = v.dateKey || (v.timestamp ? format(new Date(v.timestamp), "yyyy-MM-dd") : "");
      return dKey === todayStr;
    }).length;
    setTodayCount(tCount);

    // Compute weekly data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const counts: Record<string, number> = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      counts[format(d, "yyyy-MM-dd")] = 0;
    }

    seasonFilteredVouchers.forEach((v) => {
      if (v.timestamp) {
        const d = format(new Date(v.timestamp), "yyyy-MM-dd");
        if (counts[d] !== undefined) {
          counts[d]++;
        }
      }
    });

    const chartData = Object.entries(counts).map(([date, count]) => ({
      date: format(new Date(date), "MM/dd"),
      fullDate: format(new Date(date), "yyyy-MM-dd"),
      count,
    }));
    setWeeklyData(chartData);

    const totalInWeek = Object.values(counts).reduce((acc, curr) => acc + curr, 0);
    setAverageWeekly(Number((totalInWeek / 7).toFixed(1)));

    // Compute distributed buses
    const todayMap = new Map<string, any>();
    const targetMap = new Map<string, any>();

    seasonFilteredVouchers.forEach((data) => {
      const dateKey =
        data.dateKey ||
        (data.timestamp ? format(new Date(data.timestamp), "yyyy-MM-dd") : "");
      const isToday = dateKey === todayStr;
      const isTarget =
        dateKey >= distributedBusesStartDate &&
        dateKey <= distributedBusesEndDate;

      const getBusItem = (bNum: string, specificBus?: any) => ({
        busNumber: bNum,
        driverName: specificBus?.driverName || data.driverName || "غير محدد",
        driverPhone: specificBus?.driverPhone || data.driverPhone || "",
        busType: specificBus?.busType || data.busType || "غير محدد",
        voucherNumber: data.voucherNumber || "---",
        voucherId: data.id,
        delegateName: data.delegateName || data.userName || "غير معروف",
        hajjSeason: data.hajjSeason || "1447",
        pilgrimsCount:
          Number(specificBus?.pilgrimsCount) || Number(data.pilgrimsCount) || 0,
      });

      if (data.busNumber) {
        if (isToday) {
          todayMap.set(data.busNumber, getBusItem(data.busNumber));
        }
        if (isTarget) {
          targetMap.set(data.busNumber, getBusItem(data.busNumber));
        }
      }

      if (data.buses && Array.isArray(data.buses)) {
        data.buses.forEach((b: any) => {
          if (b.busNumber) {
            if (isToday) {
              todayMap.set(b.busNumber, getBusItem(b.busNumber, b));
            }
            if (isTarget) {
              targetMap.set(b.busNumber, getBusItem(b.busNumber, b));
            }
          }
        });
      }
    });

    setDistributedBusesToday(Array.from(todayMap.values()));
    setDistributedBusesOverall(Array.from(targetMap.values()));
  }, [seasonFilteredVouchers, distributedBusesStartDate, distributedBusesEndDate]);

  // Archive listener Effect for custom date archiving
  useEffect(() => {
    if (dashboardTab !== "archiving" || !archiveTargetDate) return;

    const list = activeVouchers.filter((v) => {
      if (v.archived === true) return false;
      const dKey = v.dateKey || (v.timestamp ? format(new Date(v.timestamp), "yyyy-MM-dd") : "");
      if (archiveMode === "exact") {
        return dKey === archiveTargetDate;
      } else {
        return dKey <= archiveTargetDate;
      }
    });

    setMatchingVouchers(list);
  }, [archiveTargetDate, archiveMode, dashboardTab, activeVouchers]);

  // Execute Date-based Archiving
  const handleExecuteArchive = async () => {
    if (matchingVouchers.length === 0) return;

    setIsArchivingInProgress(true);
    const countToArchive = matchingVouchers.length;
    try {
      const batchSize = 400; // safe limit < 500
      for (let i = 0; i < matchingVouchers.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = matchingVouchers.slice(i, i + batchSize);
        chunk.forEach((v) => {
          const ref = doc(db, "vouchers", v.id);
          batch.update(ref, {
            archived: true,
            archivedAt: new Date().toISOString(),
            archivedBy: sessionUser?.displayName || "المسؤول",
          });
        });
        await batch.commit();
      }
      setArchivedCount(countToArchive);
      setIsArchiveModalOpen(false);
      setIsArchiveSuccessModalOpen(true);
    } catch (error: any) {
      console.error("Archive execution error:", error);
      setArchiveErrorMsg(error?.message || "حدث خطأ غير معروف");
      setIsArchiveModalOpen(false);
      setIsArchiveErrorModalOpen(true);
    } finally {
      setIsArchivingInProgress(false);
    }
  };

  // Execute Complete Season 1447 Archiving and Open Season 1448
  const handleExecuteSeasonArchive = async () => {
    setIsSeasonArchiving(true);
    try {
      // Find all vouchers that need archiving to 1447
      const vouchersToArchive = activeVouchers.filter((v) => {
        return v.hajjSeason !== "1448" || v.archived !== true;
      });

      const batchSize = 400;
      for (let i = 0; i < vouchersToArchive.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = vouchersToArchive.slice(i, i + batchSize);
        chunk.forEach((v) => {
          const ref = doc(db, "vouchers", v.id);
          batch.update(ref, {
            archived: true,
            hajjSeason: "1447",
            seasonName: "موسم حج 1447 هـ",
            archivedAt: new Date().toISOString(),
            archivedBy: sessionUser?.displayName || "الإدارة العامة",
            archivedReason: "أرشفة شاملة لجميع السندات في تبويب موسم حج 1447 هـ وفتح موسم حج 1448 هـ"
          });
        });
        await batch.commit();
      }

      // Update settings with active season 1448
      const settingsRef = doc(db, "settings", "app");
      try {
        await updateDoc(settingsRef, {
          activeSeason: "1448",
          activeSeasonName: "موسم حج 1448 هـ",
          lastArchivedSeason: "1447",
          lastSeasonArchivedAt: new Date().toISOString(),
        });
      } catch {
        await setDoc(settingsRef, {
          activeSeason: "1448",
          activeSeasonName: "موسم حج 1448 هـ",
          lastArchivedSeason: "1447",
          lastSeasonArchivedAt: new Date().toISOString(),
        }, { merge: true });
      }

      setActiveAppSeason("1448");
      setSeasonArchiveResult({ totalArchived: vouchersToArchive.length });
      setIsSeasonArchiveModalOpen(false);
      setIsSeasonArchiveSuccessModalOpen(true);
      setSelectedSeason("1448");
    } catch (error: any) {
      console.error("Season Archive Error:", error);
      alert("حدث خطأ أثناء أرشفة الموسم: " + (error?.message || error));
    } finally {
      setIsSeasonArchiving(false);
    }
  };

  // Filter table data
  const filteredTableData = React.useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    let list = seasonFilteredVouchers;
    
    if (filterMode === "today") {
      list = list.filter((v) => {
        const dKey = v.dateKey || (v.timestamp ? format(new Date(v.timestamp), "yyyy-MM-dd") : "");
        return dKey === today;
      });
    }

    if (tableSearchTerm) {
      const term = tableSearchTerm.toLowerCase();
      list = list.filter((v) => {
        return (
          String(v.voucherNumber).includes(term) ||
          (v.driverName || "").toLowerCase().includes(term) ||
          (v.busNumber || "").toLowerCase().includes(term) ||
          (v.approvalNumber || "").toLowerCase().includes(term) ||
          (v.userName || "").toLowerCase().includes(term) ||
          (v.delegateName || "").toLowerCase().includes(term)
        );
      });
    }

    return list;
  }, [seasonFilteredVouchers, filterMode, tableSearchTerm]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const q = query(
        collection(db, "vouchers"),
        where("dateKey", "==", today),
        orderBy("timestamp", "desc"),
      );
      const querySnapshot = await getDocs(q);

      const data: any[] = [];
      querySnapshot.docs.forEach((doc) => {
        const v = doc.data();
        const formattedDate = v.timestamp
          ? format(new Date(v.timestamp), "yyyy-MM-dd HH:mm:ss")
          : "غير معروف";

        if (v.buses && Array.isArray(v.buses) && v.buses.length > 0) {
          v.buses.forEach((b: any) => {
            data.push({
              "رقم السند": v.voucherNumber,
              "المؤسسة": v.organization || "غير محدد",
              "عدد الحافلات": v.busesQuantity || v.buses.length,
              "رقم الحافلة": b.busNumber || v.busNumber || "غير محدد",
              "نوع الحافلة": b.busType || v.busType || "غير محدد",
              "اسم السائق": b.driverName || v.driverName || "غير محدد",
              "عدد الحجاج": b.pilgrimsCount !== undefined ? b.pilgrimsCount : (v.pilgrimsCount || 0),
              "رقم الاعتماد": v.approvalNumber || "غير محدد",
              الموظف: v.userName || v.delegateName || "غير معروف",
              "التاريخ والوقت": formattedDate,
            });
          });
        } else {
          data.push({
            "رقم السند": v.voucherNumber,
            "المؤسسة": v.organization || "غير محدد",
            "عدد الحافلات": v.busesQuantity || 1,
            "رقم الحافلة": v.busNumber || "غير محدد",
            "نوع الحافلة": v.busType || "غير محدد",
            "اسم السائق": v.driverName || "غير محدد",
            "عدد الحجاج": v.pilgrimsCount || 0,
            "رقم الاعتماد": v.approvalNumber || "غير محدد",
            الموظف: v.userName || v.delegateName || "غير معروف",
            "التاريخ والوقت": formattedDate,
          });
        }
      });

      if (data.length === 0) {
        alert("لا توجد بيانات لتصديرها لهذا اليوم");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "تقرير اليوم");

      const maxLengths = Object.keys(data[0]).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...data.map((row) => String(row[key as keyof typeof row] || "").length),
          ) + 2,
      }));
      worksheet["!cols"] = maxLengths;
      worksheet["!dir"] = "rtl";

      XLSX.writeFile(workbook, `تقرير_حركة_الحافلات_${today}.xlsx`);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "vouchers");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAllExcel = async () => {
    setIsExportingAll(true);
    try {
      const q = query(collection(db, "vouchers"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);

      const data: any[] = [];
      querySnapshot.docs.forEach((doc) => {
        const v = doc.data();
        const formattedDate = v.timestamp
          ? format(new Date(v.timestamp), "yyyy-MM-dd HH:mm:ss")
          : "غير معروف";

        if (v.buses && Array.isArray(v.buses) && v.buses.length > 0) {
          v.buses.forEach((b: any) => {
            data.push({
              "رقم السند": v.voucherNumber,
              "المؤسسة": v.organization || "غير محدد",
              "عدد الحافلات": v.busesQuantity || v.buses.length,
              "رقم الحافلة": b.busNumber || v.busNumber || "غير محدد",
              "نوع الحافلة": b.busType || v.busType || "غير محدد",
              "اسم السائق": b.driverName || v.driverName || "غير محدد",
              "عدد الحجاج": b.pilgrimsCount !== undefined ? b.pilgrimsCount : (v.pilgrimsCount || 0),
              "رقم الاعتماد": v.approvalNumber || "غير محدد",
              الموظف: v.userName || v.delegateName || "غير معروف",
              "التاريخ والوقت": formattedDate,
            });
          });
        } else {
          data.push({
            "رقم السند": v.voucherNumber,
            "المؤسسة": v.organization || "غير محدد",
            "عدد الحافلات": v.busesQuantity || 1,
            "رقم الحافلة": v.busNumber || "غير محدد",
            "نوع الحافلة": v.busType || "غير محدد",
            "اسم السائق": v.driverName || "غير محدد",
            "عدد الحجاج": v.pilgrimsCount || 0,
            "رقم الاعتماد": v.approvalNumber || "غير محدد",
            الموظف: v.userName || v.delegateName || "غير معروف",
            "التاريخ والوقت": formattedDate,
          });
        }
      });

      if (data.length === 0) {
        alert("لا توجد بيانات لتصديرها");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "جميع السندات");

      const maxLengths = Object.keys(data[0]).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...data.map((row) => String(row[key as keyof typeof row] || "").length),
          ) + 2,
      }));
      worksheet["!cols"] = maxLengths;
      worksheet["!dir"] = "rtl";

      XLSX.writeFile(
        workbook,
        `جميع_سندات_حركة_الحافلات_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "vouchers");
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleExportStatsExcel = async (isTodayOnly: boolean) => {
    if (isTodayOnly) setIsExportingStats(true);
    else setIsExportingAllStats(true);

    try {
      let q;
      const today = format(new Date(), "yyyy-MM-dd");
      if (isTodayOnly) {
        q = query(collection(db, "vouchers"), where("dateKey", "==", today));
      } else {
        q = query(collection(db, "vouchers"), orderBy("timestamp", "desc"));
      }

      const querySnapshot = await getDocs(q);
      const vouchers = querySnapshot.docs.map((doc) => doc.data());

      const data = vouchers.map((v: any) => {
        let busCount = 1;
        if (v.busesQuantity !== undefined) {
          busCount = parseInt(v.busesQuantity) || (v.buses && Array.isArray(v.buses) ? v.buses.length : 1);
        } else if (v.buses && Array.isArray(v.buses)) {
          busCount = v.buses.length || 1;
        }

        const date =
          v.dateKey ||
          (v.timestamp
            ? format(new Date(v.timestamp), "yyyy-MM-dd")
            : "غير محدد");

        return {
          "رقم السند": v.voucherNumber || "غير محدد",
          "المؤسسة": v.organization || "غير محدد",
          "رقم الاعتماد": v.approvalNumber || "غير محدد",
          "عدد الحافلات": busCount,
          "التاريخ": date,
        };
      });

      if (data.length === 0) {
        alert("لا توجد بيانات لتصديرها");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "إحصائيات الحركة");

      // Column width
      const maxLengths = Object.keys(data[0]).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...data.map((row) => String(row[key as keyof typeof row] || "").length),
          ) + 2,
      }));
      worksheet["!cols"] = maxLengths;
      worksheet["!dir"] = "rtl";

      XLSX.writeFile(
        workbook,
        `إحصائيات_حركة_الحافلات_${isTodayOnly ? today : "الأرشيف"}.xlsx`,
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "vouchers");
    } finally {
      if (isTodayOnly) setIsExportingStats(false);
      else setIsExportingAllStats(false);
    }
  };

  const handleExportApprovalBusesExcel = async () => {
    setIsExportingApprovalBuses(true);
    try {
      const q = query(collection(db, "vouchers"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const vouchers = querySnapshot.docs.map((doc) => doc.data());

      const data: any[] = [];
      vouchers.forEach((v: any) => {
        const approval = v.approvalNumber?.trim();
        if (!approval) return;

        const date =
          v.dateKey ||
          (v.timestamp
            ? format(new Date(v.timestamp), "yyyy-MM-dd")
            : "غير محدد");

        if (v.buses && Array.isArray(v.buses) && v.buses.length > 0) {
          v.buses.forEach((b: any) => {
            data.push({
              "رقم الاعتماد": approval,
              "رقم الحافلة": b.busNumber || "غير محدد",
              "نوع الحافلة": b.busType || "غير محدد",
              "اسم السائق": b.driverName || "غير محدد",
              "المؤسسة": v.organization || "غير محدد",
              "رقم السند": v.voucherNumber || "غير محدد",
              "التاريخ": date,
            });
          });
        } else {
          data.push({
            "رقم الاعتماد": approval,
            "رقم الحافلة": v.busNumber || "غير محدد",
            "نوع الحافلة": v.busType || "غير محدد",
            "اسم السائق": v.driverName || "غير محدد",
            "المؤسسة": v.organization || "غير محدد",
            "رقم السند": v.voucherNumber || "غير محدد",
            "التاريخ": date,
          });
        }
      });

      if (data.length === 0) {
        alert("لا توجد بيانات اعتمادات لتصديرها");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "حافلات الاعتمادات");

      // Column width
      const maxLengths = Object.keys(data[0]).map((key) => ({
        wch:
          Math.max(
            key.length,
            ...data.map((row) => String(row[key as keyof typeof row] || "").length),
          ) + 2,
      }));
      worksheet["!cols"] = maxLengths;
      worksheet["!dir"] = "rtl";

      XLSX.writeFile(
        workbook,
        `حافلات_الاعتمادات_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "vouchers");
    } finally {
      setIsExportingApprovalBuses(false);
    }
  };

  const handleUpdateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVoucher) return;
    setIsSaving(true);
    try {
      const voucherRef = doc(db, "vouchers", editingVoucher.id);
      await updateDoc(voucherRef, {
        busNumber: editingVoucher.busNumber,
        driverName: editingVoucher.driverName,
        approvalNumber: editingVoucher.approvalNumber,
        busType: editingVoucher.busType || "",
        updatedAt: new Date().toISOString(),
      });
      setIsEditModalOpen(false);
      setEditingVoucher(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "vouchers");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVoucher = async () => {
    if (!voucherToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "vouchers", voucherToDelete.id));
      setIsDeleteModalOpen(false);
      setVoucherToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "vouchers");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = (voucher: any) => {
    setVoucherToDelete(voucher);
    setIsDeleteModalOpen(true);
  };

  const handleRemoveBusFromVoucher = async (voucher: any) => {
    // If the voucher has multiple buses, we could implement filtering here.
    // For now, based on the user request to free up the bus, deleting the voucher is the cleanest way
    // if it's a single-bus voucher. If it has a buses list, we would filter it.
    if (voucher.buses && voucher.buses.length > 1) {
      const busToRemove = window.prompt(
        "أدخل رقم الحافلة المطلوب حذفها من السند:",
      );
      if (!busToRemove) return;

      const updatedBuses = voucher.buses.filter(
        (b: any) => b.busNumber !== busToRemove,
      );
      if (updatedBuses.length === voucher.buses.length) {
        alert("رقم الحافلة غير موجود في هذا السند");
        return;
      }

      setIsSaving(true);
      try {
        await updateDoc(doc(db, "vouchers", voucher.id), {
          buses: updatedBuses,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, "vouchers");
      } finally {
        setIsSaving(false);
      }
    } else {
      handleConfirmDelete(voucher);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700/50 backdrop-blur-md">
          <p className="text-[10px] font-bold text-slate-400 mb-1">
            {payload[0].payload.fullDate}
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            <p className="text-sm font-black">
              {payload[0].value}{" "}
              <span className="text-[10px] text-slate-400 font-normal">
                سند
              </span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 size={40} className="text-blue-600 animate-spin" />
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest animate-pulse">
          جاري تحميل البيانات...
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-700 to-indigo-900 rounded-2xl flex items-center justify-center border border-amber-400/20 shadow-md">
            <LayoutDashboard size={24} className="text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">لوحة التحكم</h1>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-[10px] text-blue-800 font-black uppercase tracking-widest mt-0.5">
              نظرة عامة على نشاط النقل والعمليات الجارية - درة المنورة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-2xl border border-slate-200/90 shadow-xs group hover:border-amber-300 transition-colors">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-black text-slate-700">
            تحديث سحابي فوري
          </span>
          <span className="text-slate-300 mx-2">|</span>
          <span className="text-[10px] font-bold text-amber-700 uppercase">
            {format(new Date(), "dd MMMM yyyy")}
          </span>
        </div>
      </div>

      {/* Hajj Seasons Selector Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/90 backdrop-blur-xl p-2 sm:p-2.5 rounded-2xl border border-slate-800/80 shadow-md">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setSelectedSeason("1448")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-3 px-6 py-2.5 rounded-xl font-black text-xs transition-all duration-300 cursor-pointer select-none ${
              selectedSeason === "1448"
                ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40 ring-1 ring-white/20 scale-[1.02]"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {selectedSeason === "1448" && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
            <span className="tracking-wide">موسم حج 1448 هـ</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold transition-colors ${
                selectedSeason === "1448"
                  ? "bg-white/25 text-white border border-white/30"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              {season1448Count}
            </span>
          </button>

          <button
            onClick={() => setSelectedSeason("1447")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-3 px-6 py-2.5 rounded-xl font-black text-xs transition-all duration-300 cursor-pointer select-none ${
              selectedSeason === "1447"
                ? "bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 text-slate-950 shadow-lg shadow-amber-500/30 border border-amber-300/60 ring-1 ring-white/30 scale-[1.02]"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <FolderArchive
              size={16}
              className={
                selectedSeason === "1447" ? "text-slate-950" : "text-amber-400"
              }
            />
            <span className="tracking-wide">موسم حج 1447 هـ</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold transition-colors ${
                selectedSeason === "1447"
                  ? "bg-slate-950/20 text-slate-950 border border-slate-950/20"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              {season1447Count}
            </span>
          </button>
        </div>
      </div>

      {/* Sub-tabs Selection */}
      <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl w-fit border border-slate-200/60 shadow-inner">
        <button
          onClick={() => setDashboardTab("analytics")}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
            dashboardTab === "analytics"
              ? "bg-gradient-to-r from-blue-700 to-indigo-900 text-white shadow-md"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Activity size={16} className={dashboardTab === "analytics" ? "text-amber-300" : ""} />
          <span>الإحصائيات والنشاط ({selectedSeason === "1448" ? "حج 1448 هـ" : "حج 1447 هـ"})</span>
        </button>
        {canManage && (
          <button
            onClick={() => setDashboardTab("archiving")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
              dashboardTab === "archiving"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/20"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Calendar size={16} className={dashboardTab === "archiving" ? "text-white" : ""} />
            <span>سجل وأدوات الأرشفة</span>
          </button>
        )}
      </div>

      {dashboardTab === "analytics" ? (
        <div className="grid grid-cols-12 gap-6 auto-rows-max">
          {/* Summary Cards */}
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -5 }}
            className="col-span-12 md:col-span-4 lg:col-span-4 bg-white p-6 rounded-[2.5rem] border border-slate-200/90 shadow-sm relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-blue-600 to-amber-400"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-60 group-hover:bg-amber-50 transition-colors duration-500"></div>
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-50 to-blue-100/80 rounded-xl flex items-center justify-center border border-blue-200">
                <Activity size={20} className="text-blue-700" />
              </div>
              <div className="flex flex-col items-end">
                <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg font-black border border-emerald-200/80 flex items-center gap-1">
                  <ArrowUpRight size={8} />
                  {Math.round((todayCount / (averageWeekly || 1)) * 100)}%
                </div>
              </div>
            </div>
            <h3 className="text-slate-400 text-[10px] font-black uppercase mb-1 tracking-wider relative z-10">
              سندات اليوم
            </h3>
            <div className="flex items-end justify-between relative z-10">
              <div className="text-4xl font-black text-slate-900 leading-none">
                {todayCount}
              </div>
              <span className="text-[9px] text-blue-700 font-bold mb-1 uppercase tracking-tighter">
                سند صادر اليوم
              </span>
            </div>
            <div className="mt-6 h-1.5 bg-slate-100 rounded-full overflow-hidden relative z-10">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${totalBuses > 0 ? (todayCount / totalBuses) * 100 : 0}%`,
                }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-blue-600 to-amber-500 rounded-full shadow-xs"
              ></motion.div>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            whileHover={{ y: -5 }}
            className="col-span-12 md:col-span-4 lg:col-span-4 bg-white p-6 rounded-[2.5rem] border border-slate-200/90 shadow-sm flex flex-col justify-between group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-indigo-800 to-blue-600"></div>
            <div>
              <div className="flex justify-between items-start mb-6">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                  <Bus className="text-indigo-700" size={20} />
                </div>
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-wider">
                  الأسطول
                </h3>
              </div>
              <div>
                <div className="text-4xl font-black mb-1 text-slate-900">
                  {totalBuses}
                </div>
                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-tight">
                  إجمالي الحافلات المسجلة
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${i <= 3 ? "bg-amber-500" : "bg-blue-600"}`}
                ></div>
              ))}
            </div>
          </motion.div>

          {/* NEW Interactive Distributed Buses Card */}
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -5 }}
            className="col-span-12 md:col-span-4 lg:col-span-4 bg-white p-6 rounded-[2.5rem] border border-slate-200/90 shadow-sm relative overflow-hidden group flex flex-col justify-between"
          >
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-50 group-hover:bg-amber-100/50 transition-colors duration-500"></div>

            <div className="relative z-10 flex justify-between items-start mb-3">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-200/60">
                <Bus size={20} className="text-amber-600 animate-pulse" />
              </div>
              <span className="text-[9px] text-amber-800 font-black bg-amber-100/70 px-2.5 py-0.5 rounded-lg border border-amber-200 flex items-center gap-1">
                مؤشر تفاعلي مباشر
              </span>
            </div>

            <div className="relative z-10 mb-2">
              <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                الحافلات الموزعة في العقود
              </h3>
              <p className="text-[10.5px] text-slate-700 font-black mt-0.5 text-ellipsis overflow-hidden whitespace-nowrap">
                مؤشرات النشاط وتفاصيل التوزيع
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-2 mt-2">
              {/* Today */}
              <button
                type="button"
                onClick={() => {
                  setBusDetailModalMode("today");
                  setIsBusDetailModalOpen(true);
                  setBusModalSearchTerm("");
                }}
                className="flex flex-col items-center justify-center p-2 rounded-2xl bg-amber-50/80 border border-amber-200/80 hover:bg-amber-100 hover:border-amber-300 hover:shadow-sm active:scale-95 transition-all text-center group/btn cursor-pointer"
              >
                <span className="text-lg font-black text-amber-700">
                  {distributedBusesToday.length}
                </span>
                <span className="text-[9px] font-black text-amber-950 mt-1">
                  الموزعة اليوم
                </span>
                <span className="text-[8px] text-amber-600 mt-0.5 group-hover/btn:text-amber-800 transition-colors font-bold">
                  تفاصيل ←
                </span>
              </button>

              {/* Custom Target Date */}
              <div className="flex flex-col gap-1.5 justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setBusDetailModalMode("overall");
                    setIsBusDetailModalOpen(true);
                    setBusModalSearchTerm("");
                  }}
                  className="w-full flex flex-col items-center justify-center p-2 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm active:scale-95 transition-all text-center group/btn cursor-pointer"
                >
                  <span className="text-lg font-black text-emerald-700">
                    {distributedBusesOverall.length}
                  </span>
                  <span className="text-[9px] font-black text-emerald-950 mt-1">
                    عقود بالفترة
                  </span>
                  <span className="text-[8px] text-emerald-600 mt-0.5 group-hover/btn:text-emerald-800 transition-colors font-bold">
                    تفاصيل ←
                  </span>
                </button>
                <div 
                  className="grid grid-cols-2 gap-1 w-full" 
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-slate-400 text-right pr-1">من</span>
                    <input
                      type="date"
                      value={distributedBusesStartDate}
                      onChange={(e) => setDistributedBusesStartDate(e.target.value)}
                      className="w-full text-center text-[9px] font-bold text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100/40 border border-emerald-200 rounded-xl py-1 px-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                      dir="rtl"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-slate-400 text-right pr-1">إلى</span>
                    <input
                      type="date"
                      value={distributedBusesEndDate}
                      onChange={(e) => setDistributedBusesEndDate(e.target.value)}
                      className="w-full text-center text-[9px] font-bold text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100/40 border border-emerald-200 rounded-xl py-1 px-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                      dir="rtl"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Field Reports / Export Actions */}
          <motion.div
            variants={itemVariants}
            className="col-span-12"
          >
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-[2.5rem] p-6 lg:p-8 text-white relative overflow-hidden group border border-indigo-900/50 shadow-xl">
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-400 via-amber-300 to-blue-500"></div>
              <div className="absolute top-0 right-0 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
              <div className="relative z-10 flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-black">تقارير الميدان وتصدير البيانات</h3>
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed font-medium">
                      تصدير كافة البيانات المتعلقة بحركة الحافلات والاعتمادات بصيغة Excel للمراجعة والتدقيق المالي
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportExcel}
                    disabled={
                      isExporting ||
                      isExportingAll ||
                      isExportingStats ||
                      isExportingAllStats ||
                      isExportingApprovalBuses
                    }
                    className="flex items-center justify-between p-4 bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl transition-all group/btn disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-400/30 shrink-0">
                        <Download size={18} className="text-emerald-400" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black">تقرير اليوم</p>
                        <p className="text-[9px] text-amber-300 font-mono tracking-wider">
                          EXCEL FORMAT
                        </p>
                      </div>
                    </div>
                    {isExporting ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-slate-400"
                      />
                    ) : (
                      <ArrowUpRight
                        size={16}
                        className="text-slate-400 group-hover/btn:text-amber-300 transition-colors"
                      />
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportAllExcel}
                    disabled={
                      isExporting ||
                      isExportingAll ||
                      isExportingStats ||
                      isExportingAllStats ||
                      isExportingApprovalBuses
                    }
                    className="flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all group/btn disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-400/30 shrink-0">
                        <Download size={18} className="text-blue-400" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">الأرشيف الكامل</p>
                        <p className="text-[9px] text-slate-400 tracking-wider">
                          ALL VOUCHERS
                        </p>
                      </div>
                    </div>
                    {isExportingAll ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-slate-400"
                      />
                    ) : (
                      <ArrowUpRight
                        size={16}
                        className="text-slate-500 group-hover/btn:text-white transition-colors"
                      />
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleExportStatsExcel(true)}
                    disabled={
                      isExporting ||
                      isExportingAll ||
                      isExportingStats ||
                      isExportingAllStats ||
                      isExportingApprovalBuses
                    }
                    className="flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all group/btn disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-400/30 shrink-0">
                        <TrendingUp size={18} className="text-orange-400" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">إحصائيات اليوم</p>
                        <p className="text-[9px] text-slate-400 tracking-wider">
                          OFFICE STATS - TODAY
                        </p>
                      </div>
                    </div>
                    {isExportingStats ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-slate-400"
                      />
                    ) : (
                      <ArrowUpRight
                        size={16}
                        className="text-slate-500 group-hover/btn:text-white transition-colors"
                      />
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleExportStatsExcel(false)}
                    disabled={
                      isExporting ||
                      isExportingAll ||
                      isExportingStats ||
                      isExportingAllStats ||
                      isExportingApprovalBuses
                    }
                    className="flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all group/btn disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-400/30 shrink-0">
                        <Users size={18} className="text-purple-400" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">كافة الإحصائيات</p>
                        <p className="text-[9px] text-slate-400 tracking-wider">
                          ALL OFFICE STATS
                        </p>
                      </div>
                    </div>
                    {isExportingAllStats ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-slate-400"
                      />
                    ) : (
                      <ArrowUpRight
                        size={16}
                        className="text-slate-500 group-hover/btn:text-white transition-colors"
                      />
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportApprovalBusesExcel}
                    disabled={
                      isExporting ||
                      isExportingAll ||
                      isExportingStats ||
                      isExportingAllStats ||
                      isExportingApprovalBuses
                    }
                    className="flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all group/btn disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-teal-500/20 rounded-xl flex items-center justify-center border border-teal-400/30 shrink-0">
                        <Bus size={18} className="text-teal-400" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">حافلات الاعتمادات</p>
                        <p className="text-[9px] text-slate-400 tracking-wider">
                          EXPORT APPROVAL BUSES
                        </p>
                      </div>
                    </div>
                    {isExportingApprovalBuses ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-slate-400"
                      />
                    ) : (
                      <ArrowUpRight
                        size={16}
                        className="text-slate-500 group-hover/btn:text-white transition-colors"
                      />
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Main Stats Table Area */}
          <motion.div
            variants={itemVariants}
            className="col-span-12 bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]"
          >
            <div className="px-8 py-8 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
                  <FileText size={24} className="text-slate-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-900">
                      سجل العمليات
                    </h2>
                    {selectedSeason === "1448" ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                        موسم حج 1448 هـ
                      </span>
                    ) : selectedSeason === "1447" ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                        موسم حج 1447 هـ (أرشيف)
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                        جميع المواسم
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    {filterMode === "today"
                      ? "عرض السندات المسجلة اليوم فقط للموسم المحدد"
                      : `عرض سندات ${selectedSeason === "1448" ? "موسم حج 1448 هـ" : selectedSeason === "1447" ? "موسم حج 1447 هـ المؤرشفة" : "جميع المواسم"}`}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <input
                    type="text"
                    placeholder="بحث في السجل الحالي..."
                    value={tableSearchTerm}
                    onChange={(e) => setTableSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                  />
                  <Activity
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>

                <div className="flex items-center gap-2 p-1.5 bg-slate-100/50 rounded-2xl border border-slate-100 shadow-inner">
                  <button
                    onClick={() => setFilterMode("all")}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${filterMode === "all" ? "bg-white shadow-sm border border-slate-200 text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    الكل
                  </button>
                  <button
                    onClick={() => setFilterMode("today")}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${filterMode === "today" ? "bg-white shadow-sm border border-slate-200 text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    اليوم
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[600px] relative">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-5">رقم السند</th>
                    <th className="px-8 py-5">بيانات الحافلة</th>
                    <th className="px-8 py-5">السائق</th>
                    <th className="px-8 py-5 text-center">كود الاعتماد</th>
                    <th className="px-8 py-5">المسؤول</th>
                    <th className="px-8 py-5">توقيت</th>
                    {canManage && (
                      <th className="px-8 py-5 text-left">الإجراءات</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <AnimatePresence mode="popLayout">
                    {filteredTableData.map((v, idx) => (
                      <motion.tr
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        key={v.id}
                        className="hover:bg-slate-50/80 transition-all group"
                      >
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="font-mono text-blue-600 font-black text-sm group-hover:translate-x-1 transition-transform">
                              #{v.voucherNumber}
                            </span>
                            <span className="text-[8px] text-slate-300 font-bold uppercase mt-0.5 tracking-tighter">
                              ID: {v.id.substring(0, 8)}
                            </span>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {v.hajjSeason === "1448" ? (
                                <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[8px] font-black border border-blue-200">
                                  1448 هـ
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[8px] font-black border border-amber-200">
                                  1447 هـ
                                </span>
                              )}
                              {v.archived && (
                                <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[8px] font-black leading-none">
                                  مؤرشف
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center font-black text-slate-900 shadow-sm group-hover:border-blue-200 group-hover:shadow-blue-50 transition-all text-xs">
                              {v.busNumber}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-800">
                                {v.busType || "حافلة نقل"}
                              </span>
                              <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">
                                VEHICLE UNIT
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 font-black text-[10px] border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                              {v.driverName?.charAt(0) || "D"}
                            </div>
                            <span className="font-bold text-slate-800 truncate max-w-[150px]">
                              {v.driverName}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg border border-slate-200/60 group-hover:border-blue-200 transition-colors">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                            <span className="text-[10px] font-black text-slate-700 tracking-tighter">
                              {v.approvalNumber}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="text-slate-800 font-bold text-[10px]">
                              {v.userName || v.delegateName || "غير معروف"}
                            </span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">
                              AUTH OFFICER
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col items-center">
                            <span className="font-black text-slate-900 text-[10px]">
                              {format(new Date(v.timestamp), "HH:mm")}
                            </span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase mt-0.5 tracking-widest">
                              {format(new Date(v.timestamp), "dd MMM")}
                            </span>
                          </div>
                        </td>
                        {canManage && (
                          <td className="px-8 py-6 text-left">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingVoucher(v);
                                  setIsEditModalOpen(true);
                                }}
                                className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-blue-100"
                                title="تعديل السند"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleRemoveBusFromVoucher(v)}
                                className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm border border-red-100"
                                title="حذف حافلة/السند"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {filteredTableData.length === 0 && (
                    <tr>
                      <td
                        colSpan={canManage ? 7 : 6}
                        className="px-8 py-32 text-center"
                      >
                        <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-dashed border-slate-200 shadow-inner group-hover:rotate-12 transition-transform duration-700">
                          <Bus
                            className="text-slate-200 group-hover:text-slate-300 transition-colors"
                            size={40}
                          />
                        </div>
                        <p className="text-slate-400 font-black uppercase text-[12px] tracking-widest">
                          {tableSearchTerm
                            ? "لا توجد نتائج مطابقة لبحثك"
                            : "لا يوجد عمليات مسجلة حالياً"}
                        </p>
                        <p className="text-slate-300 text-[10px] mt-2 italic">
                          {tableSearchTerm
                            ? "جرب البحث بكلمات مختلفة أو رقم سند آخر"
                            : "سيتم عرض الحركات الجديدة هنا بمجرد صدورها"}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                <LayoutDashboard size={14} />
                <span>نظام متابعة حركة حافلات درة المنورة</span>
              </div>
              <p className="text-[10px] text-slate-300 font-black uppercase">
                V2.5.2 PRO
              </p>
            </div>
          </motion.div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[3rem] border border-slate-200 shadow-sm p-8 space-y-8"
        >
          {/* Main Season 1447 Archive & 1448 Season Transition Card */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-[2.5rem] p-8 border border-amber-400/40 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none -mr-24 -mt-24"></div>
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black border border-amber-400/30 flex items-center gap-1.5">
                    <Archive size={14} />
                    أرشفة المواسم الرسمية
                  </span>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black border border-emerald-400/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    الموسم النشط الحالي: حج 1448 هـ
                  </span>
                </div>
                <h3 className="text-2xl font-black text-white leading-snug">
                  أرشفة جميع السندات الحالية في تبويب موسم حج 1447 هـ وفتح موسم حج 1448 هـ
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  سيقوم هذا الإجراء بنقل وأرشفة كافة السندات والعمليات المسجلة حالياً وتوثيقها تحت <strong>"موسم حج 1447 هـ"</strong> كأرشيف محفوظ، وتحرير كافة الحافلات لتكون شاغرة وجاهزة فوراً، وضبط النظام بشكل كامل لاستقبال عمليات <strong>"موسم حج 1448 هـ"</strong> الجديدة.
                </p>
                <div className="flex items-center gap-4 text-xs pt-1 text-amber-300 font-bold">
                  <span>سندات موسم 1447 هـ: <strong>{season1447Count}</strong></span>
                  <span>|</span>
                  <span>سندات موسم 1448 هـ: <strong>{season1448Count}</strong></span>
                  <span>|</span>
                  <span>إجمالي السندات: <strong>{totalAllSeasonsCount}</strong></span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
                <button
                  onClick={() => setIsSeasonArchiveModalOpen(true)}
                  className="px-6 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-amber-500/25 border border-amber-300/50 flex items-center justify-center gap-2.5 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Sparkles size={18} className="text-slate-950" />
                  <span>تنفيذ أرشفة موسم 1447 هـ وبدء موسم 1448 هـ</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-slate-100 pb-6 pt-2">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 animate-pulse">
                <Calendar size={24} className="text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  أرشفة السندات حسب تاريخ محدد
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                  تفريغ الحافلات وتصفية السجلات النشطة حسب تاريخ يومي أو نطاق زمني
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50/50 border border-amber-100/80 p-6 rounded-2xl text-slate-700 space-y-2">
            <h4 className="text-xs font-black text-amber-800 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-600" />
              <span>مفهوم وآلية الأرشفة وإعادة إتاحة الحافلات:</span>
            </h4>
            <p className="text-[11px] leading-relaxed text-slate-600">
              أرشفة السندات تقوم بتغيير حالة السند في النظام إلى{" "}
              <strong className="text-slate-800 font-bold">"مؤرشف"</strong>. هذا
              الإجراء يقوم بـ{" "}
              <strong className="text-blue-600 font-bold">
                تحرير الحافلات المرتبطة بها تلقائياً
              </strong>{" "}
              وإعادتها لحالة التوافر (جاهزة) لتتمكن من إدخالها في سندات جديدة
              على الفور، دون الحاجة لحذف السند أو التأثير على سجلاته التاريخية
              وإحصائياته العامة.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100">
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                تحديد تاريخ الأرشفة المستهدف
              </label>
              <input
                type="date"
                value={archiveTargetDate}
                onChange={(e) => setArchiveTargetDate(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-black text-slate-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all text-sm outline-none shadow-sm"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                نطاق الأرشفة والمطابقة
              </label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setArchiveMode("older")}
                  className={`flex-1 py-3 px-4 rounded-xl border font-bold text-xs transition-all ${
                    archiveMode === "older"
                      ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  هذا التاريخ وتاريخ ما قبله (الكل)
                </button>
                <button
                  type="button"
                  onClick={() => setArchiveMode("exact")}
                  className={`flex-1 py-3 px-4 rounded-xl border font-bold text-xs transition-all ${
                    archiveMode === "exact"
                      ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  هذا التاريخ المحدد فقط
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-800 px-1">
              السندات التي تطابق الاختيار والتاريخ (غير مؤرشفة حالياً):
            </h3>

            {matchingVouchers.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-800">
                  <AlertTriangle
                    className="text-orange-600 shrink-0"
                    size={18}
                  />
                  <span className="text-xs font-black">
                    تم العثور على عدد {matchingVouchers.length} سند نشط وغير
                    مؤرشف يطابق الفئات المختارة. هل ترغب في أرشفتها الآن لإعادة
                    إتاحة حافلاتها؟
                  </span>
                </div>

                <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto bg-white shadow-inner">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] font-bold sticky top-0 text-right">
                      <tr>
                        <th className="px-6 py-4 text-right">رقم السند</th>
                        <th className="px-6 py-4 text-right">أرقام الحافلات</th>
                        <th className="px-6 py-4 text-right">مسؤول الإدخال</th>
                        <th className="px-6 py-4 text-right">التاريخ الفعلي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matchingVouchers.map((v) => {
                        const busNums =
                          v.buses && Array.isArray(v.buses)
                            ? v.buses.map((b: any) => b.busNumber).join(", ")
                            : v.busNumber;
                        return (
                          <tr key={v.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 font-mono font-black text-blue-600">
                              #{v.voucherNumber}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800">
                              {busNums || "---"}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {v.userName || v.delegateName || "---"}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {v.customDate || v.dateKey}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => setIsArchiveModalOpen(true)}
                    disabled={isArchivingInProgress}
                    className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-amber-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isArchivingInProgress ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                    <span>
                      أرشفة عدد {matchingVouchers.length} سند وتحرير الحافلات
                      فوراً
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 bg-slate-50/50 border border-slate-100 rounded-[2rem]">
                <div className="w-16 h-16 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center border border-emerald-100 mb-4 animate-bounce">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <p className="text-slate-500 font-black text-xs">
                  لا توجد سندات نشطة مطابقة للاختيار والتاريخ!
                </p>
                <p className="text-slate-400 text-[10px] mt-1">
                  كافة السندات في هذا النطاق مؤرشفة بالفعل أو لا توجد سندات
                  مسجلة.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingVoucher && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl relative z-10 border border-slate-100"
            >
              <div className="bg-slate-900 px-8 py-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                    <Edit2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">تعديل بيانات السند</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      Voucher #{editingVoucher.voucherNumber}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateVoucher} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      رقم الحافلة
                    </label>
                    <input
                      type="text"
                      required
                      value={editingVoucher.busNumber}
                      onChange={(e) =>
                        setEditingVoucher({
                          ...editingVoucher,
                          busNumber: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      كود الاعتماد
                    </label>
                    <input
                      type="text"
                      required
                      value={editingVoucher.approvalNumber}
                      onChange={(e) =>
                        setEditingVoucher({
                          ...editingVoucher,
                          approvalNumber: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    اسم السائق
                  </label>
                  <input
                    type="text"
                    required
                    value={editingVoucher.driverName}
                    onChange={(e) =>
                      setEditingVoucher({
                        ...editingVoucher,
                        driverName: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    نوع الحافلة
                  </label>
                  <select
                    value={editingVoucher.busType || ""}
                    onChange={(e) =>
                      setEditingVoucher({
                        ...editingVoucher,
                        busType: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                  >
                    <option value="حافلة كبيرة">حافلة كبيرة</option>
                    <option value="حافلة صغيرة">حافلة صغيرة</option>
                    <option value="فان">فان</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Save size={18} />
                    )}
                    <span>حفظ التعديلات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-6 py-4 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && voucherToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-slate-100 text-center p-8"
            >
              <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-red-100">
                <Trash2 size={32} className="text-red-600" />
              </div>

              <h3 className="text-xl font-black text-slate-900 mb-2">
                تأكيد حذف السند
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 px-4">
                هل أنت متأكد من رغبتك في حذف السند رقم{" "}
                <span className="font-bold text-red-600">
                  #{voucherToDelete.voucherNumber}
                </span>
                ؟ سيؤدي هذا الإجراء إلى حذف كافة بيانات السند نهائياً وتحرير
                الحافلة.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleDeleteVoucher}
                  disabled={isDeleting}
                  className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-100 hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                  <span>نعم، حذف السند</span>
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="px-6 py-4 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  تراجع
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Archive Confirmation Modal */}
      <AnimatePresence>
        {isArchiveModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsArchiveModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-slate-100 text-center p-8"
            >
              <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-amber-100">
                <Calendar size={32} className="text-amber-600" />
              </div>

              <h3 className="text-xl font-black text-slate-900 mb-2">
                تأكيد أرشفة السندات
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 px-4">
                هل أنت متأكد من أرشفة عدد{" "}
                <span className="font-bold text-amber-600">
                  {matchingVouchers.length}
                </span>{" "}
                من السندات؟ بعد الأرشفة، ستصبح الحافلات المرتبطة بها متاحة فوراً
                للاستخدام وسجلات السندات ستشير إليها كمؤرشفة.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleExecuteArchive}
                  disabled={isArchivingInProgress}
                  className="flex-1 bg-amber-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-amber-100 hover:bg-amber-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isArchivingInProgress ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  <span>نعم، تنفيذ الأرشفة</span>
                </button>
                <button
                  onClick={() => setIsArchiveModalOpen(false)}
                  disabled={isArchivingInProgress}
                  className="px-6 py-4 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  تراجع
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Archive Success Modal */}
      <AnimatePresence>
        {isArchiveSuccessModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsArchiveSuccessModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-slate-100 text-center p-8"
            >
              <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-emerald-100">
                <CheckCircle2
                  size={32}
                  className="text-emerald-500 animate-bounce"
                />
              </div>

              <h3 className="text-xl font-black text-slate-900 mb-2">
                تمت الأرشفة بنجاح
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 px-4">
                تمت أرشفة عدد{" "}
                <span className="font-bold text-emerald-600">
                  {archivedCount}
                </span>{" "}
                من السندات المحددة بنجاح. لقد تم إخلاء الحافلات المرتبطة بها وهي
                الآن{" "}
                <span className="text-emerald-600 font-bold">
                  جاهزة في النظام
                </span>{" "}
                للاستخدام مجدداً فوراً.
              </p>

              <button
                onClick={() => setIsArchiveSuccessModalOpen(false)}
                className="w-full bg-slate-950 text-white font-black py-4 rounded-2xl shadow-xl shadow-slate-200 hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
              >
                <span>حسناً</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Season 1447 Archive Confirmation Modal */}
      <AnimatePresence>
        {isSeasonArchiveModalOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSeasonArchiving && setIsSeasonArchiveModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl relative z-10 border border-amber-200 text-center p-8"
            >
              <div className="w-20 h-20 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-amber-300 shadow-xl shadow-amber-500/20 text-white">
                <Archive size={36} className="text-white" />
              </div>

              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="px-3 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                  إجراء رسمي للمواسم
                </span>
              </div>

              <h3 className="text-2xl font-black text-slate-900 mb-2">
                أرشفة موسم حج 1447 هـ وفتح موسم 1448 هـ
              </h3>

              <p className="text-slate-600 text-xs leading-relaxed mb-6 px-2">
                سيقوم هذا الإجراء بنقل وأرشفة كافة السندات والعمليات السابقة وتوثيقها تحت{" "}
                <strong className="text-amber-800 font-black">"موسم حج 1447 هـ"</strong> في الأرشيف الدائم، وتحرير جميع الحافلات وإعادتها فوراً لحالة التوفر لتكون جاهزة لـ{" "}
                <strong className="text-blue-800 font-black">"موسم حج 1448 هـ"</strong> الجديد.
              </p>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-right space-y-2 mb-6 text-xs font-semibold text-slate-700">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">إجمالي السندات الحالية:</span>
                  <span className="font-mono font-black text-slate-900">{totalAllSeasonsCount} سند</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">الوجهة الأرشيفية:</span>
                  <span className="font-black text-amber-700">موسم حج 1447 هـ</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">الموسم النشط بعد التنفيذ:</span>
                  <span className="font-black text-blue-700">موسم حج 1448 هـ</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleExecuteSeasonArchive}
                  disabled={isSeasonArchiving}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSeasonArchiving ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>جاري ترحيل وأرشفة السجلات...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>تأكيد الأرشفة وبدء موسم 1448 هـ</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setIsSeasonArchiveModalOpen(false)}
                  disabled={isSeasonArchiving}
                  className="px-6 py-4 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Season 1447 Archive Success Modal */}
      <AnimatePresence>
        {isSeasonArchiveSuccessModalOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSeasonArchiveSuccessModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-emerald-200 text-center p-8"
            >
              <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-emerald-200">
                <CheckCircle2
                  size={36}
                  className="text-emerald-600 animate-bounce"
                />
              </div>

              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="px-3 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  تم بنجاح تام
                </span>
              </div>

              <h3 className="text-2xl font-black text-slate-900 mb-2">
                مرحباً بموسم حج 1448 هـ!
              </h3>

              <p className="text-slate-600 text-xs leading-relaxed mb-6 px-2">
                تمت أرشفة وتوثيق عدد{" "}
                <span className="font-bold text-amber-700 font-mono text-sm">
                  {seasonArchiveResult.totalArchived}
                </span>{" "}
                سنداً بنجاح في تبويب <strong>"موسم حج 1447 هـ"</strong>. وتم تفريغ وتحرير كافة الحافلات لتصبح جاهزة بنسبة 100% لإصدار سندات <strong>موسم حج 1448 هـ</strong> الجديد.
              </p>

              <button
                onClick={() => setIsSeasonArchiveSuccessModalOpen(false)}
                className="w-full bg-gradient-to-r from-blue-700 to-indigo-900 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-700/20 hover:from-blue-800 hover:to-indigo-950 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>الانتقال لمتابعة موسم حج 1448 هـ</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Archive Error Modal */}
      <AnimatePresence>
        {isArchiveErrorModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsArchiveErrorModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-slate-100 text-center p-8"
            >
              <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-red-100">
                <AlertTriangle size={32} className="text-red-500" />
              </div>

              <h3 className="text-xl font-black text-slate-900 mb-2">
                فشلت عملية الأرشفة
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 px-4">
                واجه النظام خطأً أثناء الأرشفة:
                <br />
                <span className="text-red-600 font-mono text-xs block mt-2 p-2 bg-slate-50 rounded border border-slate-100">
                  {archiveErrorMsg}
                </span>
              </p>

              <button
                onClick={() => setIsArchiveErrorModalOpen(false)}
                className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2"
              >
                <span>موافق</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Interactive Distributed Buses Detail Modal */}
      <AnimatePresence>
        {isBusDetailModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBusDetailModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            ></motion.div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl relative z-10 border border-slate-100 p-8 flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      busDetailModalMode === "today"
                        ? "bg-amber-50 border border-amber-100 text-amber-600"
                        : "bg-emerald-50 border border-emerald-100 text-emerald-600"
                    }`}
                  >
                    <Bus size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">
                      {busDetailModalMode === "today"
                        ? "الحافلات الموزعة اليوم"
                        : `الحافلات الموزعة بالفترة من ${distributedBusesStartDate} إلى ${distributedBusesEndDate}`}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                      {busDetailModalMode === "today"
                        ? "تفاصيل الحافلات الموزعة ضمن العقود الحالية لهذا اليوم"
                        : `سجل نشاط الحافلات الموزعة في العقود للفترة من ${distributedBusesStartDate} إلى ${distributedBusesEndDate}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBusDetailModalOpen(false)}
                  className="w-10 h-10 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-650 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative my-4">
                <input
                  type="text"
                  placeholder="ابحث برقم الحافلة، اسم السائق، أو رقم السند..."
                  value={busModalSearchTerm}
                  onChange={(e) => setBusModalSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 px-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-right"
                  dir="rtl"
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
                {(() => {
                  const sourceList =
                    busDetailModalMode === "today"
                      ? distributedBusesToday
                      : distributedBusesOverall;
                  const filtered = sourceList.filter((item) => {
                    const term = busModalSearchTerm.trim().toLowerCase();
                    if (!term) return true;
                    return (
                      (item.busNumber &&
                        item.busNumber.toLowerCase().includes(term)) ||
                      (item.driverName &&
                        item.driverName.toLowerCase().includes(term)) ||
                      (item.driverPhone &&
                        item.driverPhone.toLowerCase().includes(term)) ||
                      (item.busType &&
                        item.busType.toLowerCase().includes(term)) ||
                      (item.delegateName &&
                        item.delegateName.toLowerCase().includes(term)) ||
                      (item.voucherNumber &&
                        item.voucherNumber.toLowerCase().includes(term))
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <p className="text-slate-400 font-bold text-xs">
                          لا توجد حافلات موزعة مطابقة للبحث
                        </p>
                      </div>
                    );
                  }

                  return filtered.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-3xl border border-slate-100 hover:ring-2 hover:ring-slate-150 bg-slate-50/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 text-right"
                      dir="rtl"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-slate-900 text-white font-black px-2 py-0.5 rounded-lg">
                            حافلة رقم #{item.busNumber}
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-lg border border-slate-200/50">
                            {item.busType}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-500 font-semibold pt-1">
                          <p>
                            السائق:{" "}
                            <span className="font-bold text-slate-800">
                              {item.driverName}
                            </span>
                          </p>
                          {item.driverPhone && (
                            <p>
                              الهاتف:{" "}
                              <span className="font-bold text-slate-800 dir-ltr">
                                {item.driverPhone}
                              </span>
                            </p>
                          )}
                          <p>
                            المندوب:{" "}
                            <span className="font-bold text-slate-800">
                              {item.delegateName}
                            </span>
                          </p>
                          <p>
                            عدد الحجاج:{" "}
                            <span className="font-bold text-amber-700">
                              {item.pilgrimsCount}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          رقم السند المرتبط
                        </span>
                        <span className="text-xs bg-blue-50 text-blue-700 font-black px-2.5 py-1 rounded-xl border border-blue-100/50">
                          #{item.voucherNumber}
                        </span>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsBusDetailModalOpen(false)}
                  className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-2xl transition-all cursor-pointer shadow-lg shadow-slate-950/10"
                >
                  إغلاق النافذة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
