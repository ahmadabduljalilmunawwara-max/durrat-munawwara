import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, handleFirestoreError, OperationType, auth } from "../lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { format } from "date-fns";
import {
  Bus,
  Calendar,
  Download,
  Loader2,
  Activity,
  Clock,
  FileText,
  Edit2,
  Trash2,
  X,
  Save,
  AlertTriangle,
  CheckCircle2,
  Archive,
  Sparkles,
  ChevronDown,
  PlusCircle,
  ArrowLeft,
  BarChart3,
  Building2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../App";
import { buildUsersLookupMap, resolveVoucherIssuerForUI } from "../lib/issuerName";

export function Dashboard({ onNavigateToEntry }: { onNavigateToEntry?: () => void } = {}) {
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
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isExportingStats, setIsExportingStats] = useState(false);
  const [isExportingAllStats, setIsExportingAllStats] = useState(false);
  const [isExportingApprovalBuses, setIsExportingApprovalBuses] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
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

  // Tabs & Archiving States
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

  // Interactive Distributed Buses Tracker
  const [activeVouchers, setActiveVouchers] = useState<any[]>([]);
  const [usersLookupMap, setUsersLookupMap] = useState<Record<string, any>>({});
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

  // Close export menu on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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

    const unsubUsers = onSnapshot(
      collection(db, "app_users"),
      (snap) => {
        const usersList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsersLookupMap(buildUsersLookupMap(usersList));
      },
      (err) => {
        console.error("Error listening to app_users:", err);
      },
    );

    return () => {
      unsub();
      unsubBuses();
      unsubUsers();
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

  // Daily voucher counts for the selected season (ascending)
  const seasonDailyData = useMemo(() => {
    const counts: Record<string, number> = {};
    seasonFilteredVouchers.forEach((v) => {
      const dKey =
        v.dateKey ||
        (v.timestamp ? format(new Date(v.timestamp), "yyyy-MM-dd") : "");
      if (dKey) {
        counts[dKey] = (counts[dKey] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, count]) => {
        const parsed = new Date(`${d}T12:00:00`);
        const isValidDate = !isNaN(parsed.getTime());
        return {
          date: isValidDate ? format(parsed, "MM/dd") : d,
          fullDate: d,
          count,
        };
      });
  }, [seasonFilteredVouchers]);

  const latestOperations = useMemo(
    () => seasonFilteredVouchers.slice(0, 5),
    [seasonFilteredVouchers],
  );

  // Compute stats reactively based on seasonFilteredVouchers
  useEffect(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    
    // Today count
    const tCount = seasonFilteredVouchers.filter((v) => {
      const dKey = v.dateKey || (v.timestamp ? format(new Date(v.timestamp), "yyyy-MM-dd") : "");
      return dKey === todayStr;
    }).length;
    setTodayCount(tCount);

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
        delegateName: resolveVoucherIssuerForUI(data, usersLookupMap) || data.receiverName || "",
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
  }, [seasonFilteredVouchers, distributedBusesStartDate, distributedBusesEndDate, usersLookupMap]);

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
          resolveVoucherIssuerForUI(v, usersLookupMap).toLowerCase().includes(term)
        );
      });
    }

    return list;
  }, [seasonFilteredVouchers, filterMode, tableSearchTerm, usersLookupMap]);

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
              "أصدره": resolveVoucherIssuerForUI(v, usersLookupMap),
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
            "أصدره": resolveVoucherIssuerForUI(v, usersLookupMap),
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
              "أصدره": resolveVoucherIssuerForUI(v, usersLookupMap),
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
            "أصدره": resolveVoucherIssuerForUI(v, usersLookupMap),
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[var(--navy)] text-white p-[var(--space-3)] rounded-2xl shadow-2xl border border-slate-700/60">
          <p className="text-xs font-bold text-slate-300 mb-[var(--space-1)] tabular-nums">
            {payload[0].payload.fullDate}
          </p>
          <div className="flex items-center gap-[var(--space-2)]">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            <p className="text-sm font-black tabular-nums">
              {Number(payload[0].value || 0).toLocaleString("en-US")}{" "}
              <span className="text-xs text-slate-300 font-normal">سند</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const isAnyExporting =
    isExporting ||
    isExportingAll ||
    isExportingStats ||
    isExportingAllStats ||
    isExportingApprovalBuses;

  const formatOfficeLabel = (v: any) => {
    if (v.delegateNumber && v.organization) {
      return `مكتب ${v.delegateNumber} · ${v.organization}`;
    }
    if (v.delegateNumber) {
      return `مكتب ${v.delegateNumber}`;
    }
    return v.organization || v.receiverName || "غير محدد";
  };

  const formatBusesLabel = (v: any) => {
    if (Array.isArray(v.buses) && v.buses.length > 0) {
      const nums = v.buses
        .map((b: any) => b.busNumber)
        .filter(Boolean);
      if (nums.length === 1) return `#${nums[0]}`;
      if (nums.length > 1) {
        const preview = nums.slice(0, 3).map((n: string) => `#${n}`).join("، ");
        return `${nums.length} حافلات (${preview}${nums.length > 3 ? "…" : ""})`;
      }
    }
    return v.busNumber ? `#${v.busNumber}` : "---";
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-[var(--space-4)]">
        <Loader2 size={40} className="text-[var(--primary)] animate-spin" />
        <p className="text-[var(--text-muted)] font-bold text-xs animate-pulse">
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
      className="w-full space-y-[var(--space-3)]"
    >
      {/* Unified Compact Top Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-[var(--space-4)] bg-[var(--surface)] p-[var(--space-3)] lg:p-[var(--space-4)] rounded-2xl border border-[var(--border)] shadow-2xs">
        {/* Two Main Tabs Only */}
        <div className="flex items-center gap-[var(--space-2)] bg-[var(--surface-subtle)] p-[var(--space-1)] rounded-xl border border-[var(--border)] w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setDashboardTab("analytics")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] rounded-lg font-black text-xs transition-all cursor-pointer ${
              dashboardTab === "analytics"
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text)]"
            }`}
          >
            <Activity size={16} />
            <span>الإحصائيات</span>
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab("archiving")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] rounded-lg font-black text-xs transition-all cursor-pointer ${
              dashboardTab === "archiving"
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text)]"
            }`}
          >
            <FileText size={16} />
            <span>السجل والأرشيف</span>
          </button>
        </div>

        {/* Season Dropdown, Cloud Status & Light Export Dropdown */}
        <div className="flex flex-wrap items-center gap-[var(--space-3)]">
          {/* Season Dropdown */}
          <div className="relative">
            <select
              aria-label="اختيار موسم الحج"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value as "1448" | "1447")}
              className="appearance-none bg-[var(--surface-subtle)] hover:bg-[var(--surface)] border border-[var(--border)] rounded-xl py-[var(--space-3)] pr-[var(--space-4)] pl-[var(--space-8)] text-xs font-black text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] cursor-pointer transition-colors"
            >
              <option value="1448">موسم حج 1448 هـ</option>
              <option value="1447">موسم حج 1447 هـ</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute left-[var(--space-3)] top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            />
          </div>

          {/* Cloud Live Status */}
          <div className="flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)]">
            <div className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"></div>
            <span className="text-xs font-bold text-[var(--text)]">
              تحديث سحابي فوري
            </span>
          </div>

          {/* Light Export Dropdown Button */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              disabled={isAnyExporting}
              className="flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] hover:bg-[var(--surface-subtle)] text-[var(--text)] border border-[var(--border)] rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isAnyExporting ? (
                <Loader2 size={16} className="animate-spin text-[var(--primary)]" />
              ) : (
                <Download size={16} className="text-[var(--primary)]" />
              )}
              <span>تصدير</span>
              <ChevronDown
                size={14}
                className={`text-[var(--text-secondary)] transition-transform ${
                  isExportMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <AnimatePresence>
              {isExportMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 mt-[var(--space-2)] w-56 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl z-40 py-[var(--space-2)] overflow-hidden"
                >
                  <button
                    type="button"
                    disabled={isAnyExporting}
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      handleExportExcel();
                    }}
                    className="w-full flex items-center justify-between px-[var(--space-4)] py-[var(--space-3)] text-right text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>تقرير اليوم</span>
                    <Download size={14} className="text-[var(--primary)]" />
                  </button>
                  <button
                    type="button"
                    disabled={isAnyExporting}
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      handleExportStatsExcel(true);
                    }}
                    className="w-full flex items-center justify-between px-[var(--space-4)] py-[var(--space-3)] text-right text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>إحصائيات اليوم</span>
                    <Download size={14} className="text-[var(--primary)]" />
                  </button>
                  <button
                    type="button"
                    disabled={isAnyExporting}
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      handleExportStatsExcel(false);
                    }}
                    className="w-full flex items-center justify-between px-[var(--space-4)] py-[var(--space-3)] text-right text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>كافة الإحصائيات</span>
                    <Download size={14} className="text-[var(--primary)]" />
                  </button>
                  <button
                    type="button"
                    disabled={isAnyExporting}
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      handleExportAllExcel();
                    }}
                    className="w-full flex items-center justify-between px-[var(--space-4)] py-[var(--space-3)] text-right text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>الأرشيف الكامل</span>
                    <Download size={14} className="text-[var(--primary)]" />
                  </button>
                  <button
                    type="button"
                    disabled={isAnyExporting}
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      handleExportApprovalBusesExcel();
                    }}
                    className="w-full flex items-center justify-between px-[var(--space-4)] py-[var(--space-3)] text-right text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>حافلات الاعتمادات</span>
                    <Download size={14} className="text-[var(--primary)]" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {dashboardTab === "analytics" ? (
        <div className="space-y-[var(--space-6)]">
          {/* Top Row: 4 Equal-Size KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--space-6)] items-stretch">
            {/* KPI 1: سندات اليوم */}
            <motion.div
              variants={itemVariants}
              className="h-full bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-3xl border border-[var(--border)] shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
              <div className="flex items-center justify-between mb-[var(--space-4)]">
                <span className="text-xs font-black text-[var(--text-secondary)]">
                  سندات اليوم
                </span>
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-200/80 dark:border-blue-500/30">
                  <Activity size={20} className="text-[var(--primary)]" />
                </div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-black text-[var(--text)] leading-none tabular-nums">
                  {todayCount.toLocaleString("en-US")}
                </div>
                <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-2)]">
                  سند صادر اليوم
                </p>
              </div>
            </motion.div>

            {/* KPI 2: حافلات سُلّمت اليوم */}
            <motion.div
              variants={itemVariants}
              className="h-full bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-3xl border border-[var(--border)] shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
              <div className="flex items-center justify-between mb-[var(--space-4)]">
                <span className="text-xs font-black text-[var(--text-secondary)]">
                  حافلات سُلّمت اليوم
                </span>
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-200/80 dark:border-blue-500/30">
                  <Bus size={20} className="text-[var(--primary)]" />
                </div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-black text-[var(--text)] leading-none tabular-nums">
                  {distributedBusesToday.length.toLocaleString("en-US")}
                </div>
                <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-2)]">
                  حافلة تم تسليمها اليوم
                </p>
              </div>
            </motion.div>

            {/* KPI 3: إجمالي الحافلات المسجلة */}
            <motion.div
              variants={itemVariants}
              className="h-full bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-3xl border border-[var(--border)] shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
              <div className="flex items-center justify-between mb-[var(--space-4)]">
                <span className="text-xs font-black text-[var(--text-secondary)]">
                  إجمالي الحافلات المسجلة
                </span>
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-200/80 dark:border-blue-500/30">
                  <Bus size={20} className="text-[var(--primary)]" />
                </div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-black text-[var(--text)] leading-none tabular-nums">
                  {totalBuses.toLocaleString("en-US")}
                </div>
                <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-2)]">
                  إجمالي الأسطول المسجل
                </p>
              </div>
            </motion.div>

            {/* KPI 4: العقود بالفترة */}
            <motion.div
              variants={itemVariants}
              className="h-full bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-3xl border border-[var(--border)] shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
              <div className="flex items-center justify-between mb-[var(--space-4)]">
                <span className="text-xs font-black text-[var(--text-secondary)]">
                  العقود بالفترة
                </span>
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-200/80 dark:border-blue-500/30">
                  <Calendar size={20} className="text-[var(--primary)]" />
                </div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-black text-[var(--text)] leading-none tabular-nums">
                  {distributedBusesOverall.length.toLocaleString("en-US")}
                </div>
                <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-2)]">
                  حافلة موزعة ضمن الفترة المحددة
                </p>
              </div>
            </motion.div>
          </div>

          {/* Standalone Section: الحافلات الموزعة في العقود */}
          <motion.div
            variants={itemVariants}
            className="bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-8)] rounded-3xl border border-[var(--border)] shadow-sm relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-[var(--space-6)] mb-[var(--space-6)]">
              <div className="flex items-center gap-[var(--space-3)]">
                <div className="w-11 h-11 bg-blue-50 dark:bg-blue-500/15 rounded-2xl flex items-center justify-center border border-blue-200/80 dark:border-blue-500/30 shrink-0">
                  <Bus size={22} className="text-[var(--primary)]" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-[var(--text)]">
                    الحافلات الموزعة في العقود
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] font-bold mt-[var(--space-1)]">
                    متابعة الحافلات الموزعة اليوم أو خلال فترة زمنية محددة مع عرض التفاصيل
                  </p>
                </div>
              </div>

              {/* Date Range Inputs (من / إلى) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-4)] w-full lg:w-auto">
                <div className="flex flex-col gap-[var(--space-2)]">
                  <label className="text-xs font-black text-[var(--text-secondary)] pr-[var(--space-1)]">
                    من
                  </label>
                  <input
                    type="date"
                    value={distributedBusesStartDate}
                    onChange={(e) => setDistributedBusesStartDate(e.target.value)}
                    className="w-full sm:w-44 text-[14px] font-bold text-[var(--text)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl py-[var(--space-3)] px-[var(--space-4)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] cursor-pointer tabular-nums"
                    dir="rtl"
                  />
                </div>
                <div className="flex flex-col gap-[var(--space-2)]">
                  <label className="text-xs font-black text-[var(--text-secondary)] pr-[var(--space-1)]">
                    إلى
                  </label>
                  <input
                    type="date"
                    value={distributedBusesEndDate}
                    onChange={(e) => setDistributedBusesEndDate(e.target.value)}
                    className="w-full sm:w-44 text-[14px] font-bold text-[var(--text)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl py-[var(--space-3)] px-[var(--space-4)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] cursor-pointer tabular-nums"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-4)]">
              <button
                type="button"
                onClick={() => {
                  setBusDetailModalMode("today");
                  setIsBusDetailModalOpen(true);
                  setBusModalSearchTerm("");
                }}
                className="flex items-center justify-between p-[var(--space-4)] lg:p-[var(--space-5)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] hover:border-[var(--primary)]/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 transition-all text-right cursor-pointer"
              >
                <div>
                  <span className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-1)]">
                    الموزعة اليوم
                  </span>
                  <span className="text-2xl font-black text-[var(--text)] tabular-nums">
                    {distributedBusesToday.length.toLocaleString("en-US")}
                  </span>
                </div>
                <span className="inline-flex items-center gap-[var(--space-1)] text-xs font-black text-[var(--primary)]">
                  <span>عرض التفاصيل</span>
                  <ArrowLeft size={16} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBusDetailModalMode("overall");
                  setIsBusDetailModalOpen(true);
                  setBusModalSearchTerm("");
                }}
                className="flex items-center justify-between p-[var(--space-4)] lg:p-[var(--space-5)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] hover:border-[var(--primary)]/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 transition-all text-right cursor-pointer"
              >
                <div>
                  <span className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-1)]">
                    عقود بالفترة
                  </span>
                  <span className="text-2xl font-black text-[var(--text)] tabular-nums">
                    {distributedBusesOverall.length.toLocaleString("en-US")}
                  </span>
                </div>
                <span className="inline-flex items-center gap-[var(--space-1)] text-xs font-black text-[var(--primary)]">
                  <span>عرض التفاصيل</span>
                  <ArrowLeft size={16} />
                </span>
              </button>
            </div>
          </motion.div>

          {/* Daily Season BarChart + Latest 5 Operations */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-[var(--space-6)]">
            {/* Simple Daily Column Chart across selected season */}
            <motion.div
              variants={itemVariants}
              className="xl:col-span-6 bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-8)] rounded-3xl border border-[var(--border)] shadow-sm relative overflow-hidden flex flex-col"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
              <div className="flex items-center justify-between gap-[var(--space-3)] mb-[var(--space-6)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-200/80 dark:border-blue-500/30">
                    <BarChart3 size={20} className="text-[var(--primary)]" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-[var(--text)]">
                      السندات اليومية خلال الموسم
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-1)]">
                      {selectedSeason === "1448"
                        ? "توزيع عدد السندات يومياً — موسم حج 1448 هـ"
                        : "توزيع عدد السندات يومياً — موسم حج 1447 هـ"}
                    </p>
                  </div>
                </div>
              </div>

              {seasonDailyData.length > 0 ? (
                <div className="h-72 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={seasonDailyData}
                      margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: "var(--text-secondary)", fontWeight: 700 }}
                        axisLine={{ stroke: "var(--border)" }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "var(--text-secondary)", fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: "var(--surface-subtle)", opacity: 0.6 }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#1D4ED8"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={42}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-[var(--space-12)] text-center bg-[var(--surface-subtle)] rounded-2xl border border-dashed border-[var(--border)]">
                  <div className="w-14 h-14 bg-[var(--surface)] rounded-2xl flex items-center justify-center border border-[var(--border)] mb-[var(--space-4)]">
                    <BarChart3 size={24} className="text-[var(--text-muted)]" />
                  </div>
                  <p className="text-sm font-black text-[var(--text-secondary)]">
                    لا توجد عمليات مسجلة لعرض الرسم البياني
                  </p>
                  <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-1)] mb-[var(--space-4)]">
                    ابدأ بإصدار أول سند في هذا الموسم لعرض النشاط اليومي
                  </p>
                  {onNavigateToEntry && (
                    <button
                      type="button"
                      onClick={onNavigateToEntry}
                      className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm"
                    >
                      <PlusCircle size={16} />
                      <span>إصدار سند جديد</span>
                    </button>
                  )}
                </div>
              )}
            </motion.div>

            {/* Latest 5 Operations Section */}
            <motion.div
              variants={itemVariants}
              className="xl:col-span-6 bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-8)] rounded-3xl border border-[var(--border)] shadow-sm relative overflow-hidden flex flex-col"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
              <div className="flex items-center justify-between gap-[var(--space-3)] mb-[var(--space-6)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/15 rounded-xl flex items-center justify-center border border-blue-200/80 dark:border-blue-500/30">
                    <Clock size={20} className="text-[var(--primary)]" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-[var(--text)]">
                      آخر العمليات
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-1)]">
                      أحدث 5 سندات صادرة في الموسم المحدد
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDashboardTab("archiving");
                    setFilterMode("all");
                  }}
                  className="inline-flex items-center gap-[var(--space-1)] text-xs font-black text-[var(--primary)] hover:underline cursor-pointer shrink-0"
                >
                  <span>عرض الكل</span>
                  <ArrowLeft size={14} />
                </button>
              </div>

              {latestOperations.length > 0 ? (
                <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--surface)]">
                  {latestOperations.map((v) => {
                    const timestampDate = v.timestamp ? new Date(v.timestamp) : null;
                    const timeStr =
                      timestampDate && !isNaN(timestampDate.getTime())
                        ? format(timestampDate, "HH:mm · yyyy/MM/dd")
                        : v.customDate || v.dateKey || "---";
                    const issuerName = resolveVoucherIssuerForUI(v, usersLookupMap);

                    return (
                      <div
                        key={v.id}
                        className="p-[var(--space-4)] hover:bg-[var(--surface-subtle)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-3)]"
                      >
                        <div className="space-y-[var(--space-1)] min-w-0">
                          <div className="flex items-center gap-[var(--space-2)] flex-wrap">
                            <span className="font-mono font-black text-sm text-[var(--primary)] tabular-nums">
                              #{v.voucherNumber}
                            </span>
                            <span className="inline-flex items-center gap-[var(--space-1)] text-xs font-bold text-[var(--text)] truncate">
                              <Building2 size={14} className="text-[var(--text-muted)] shrink-0" />
                              <span className="truncate">{formatOfficeLabel(v)}</span>
                            </span>
                          </div>
                          <div className="flex items-center flex-wrap gap-x-[var(--space-3)] gap-y-[var(--space-1)] text-xs text-[var(--text-secondary)] font-semibold">
                            <span className="inline-flex items-center gap-[var(--space-2)] min-w-0">
                              <Bus size={14} className="text-[var(--text-muted)] shrink-0" />
                              <span className="truncate tabular-nums">{formatBusesLabel(v)}</span>
                            </span>
                            {issuerName && (
                              <span className="text-[11px] font-bold text-[var(--text-muted)] truncate">
                                أصدره: <span className="text-[var(--text-secondary)]">{issuerName}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-[var(--space-2)] shrink-0">
                          <span className="text-xs font-bold text-[var(--text-muted)] tabular-nums">
                            {timeStr}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-[var(--space-12)] text-center bg-[var(--surface-subtle)] rounded-2xl border border-dashed border-[var(--border)]">
                  <div className="w-14 h-14 bg-[var(--surface)] rounded-2xl flex items-center justify-center border border-[var(--border)] mb-[var(--space-4)]">
                    <FileText size={24} className="text-[var(--text-muted)]" />
                  </div>
                  <p className="text-sm font-black text-[var(--text-secondary)]">
                    لا توجد عمليات مسجلة حالياً
                  </p>
                  <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-1)] mb-[var(--space-4)]">
                    لم يتم إصدار أي سندات في هذا الموسم حتى الآن
                  </p>
                  {onNavigateToEntry && (
                    <button
                      type="button"
                      onClick={onNavigateToEntry}
                      className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm"
                    >
                      <PlusCircle size={16} />
                      <span>إصدار سند جديد</span>
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      ) : (
        <div className="space-y-[var(--space-6)]">
          {/* Operations Log & Filter Section */}
          <motion.div
            variants={itemVariants}
            className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col relative"
          >
            <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)] z-10"></div>
            <div className="p-[var(--space-4)] lg:p-[var(--space-8)] border-b border-[var(--border)] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-[var(--space-6)] bg-[var(--surface-subtle)]">
              <div className="flex items-center gap-[var(--space-4)]">
                <div className="w-12 h-12 bg-[var(--surface)] rounded-2xl flex items-center justify-center border border-[var(--border)] shrink-0">
                  <FileText size={24} className="text-[var(--primary)]" />
                </div>
                <div>
                  <div className="flex items-center gap-[var(--space-2)] flex-wrap">
                    <h2 className="text-lg font-black text-[var(--text)]">
                      سجل العمليات
                    </h2>
                    <span className="px-[var(--space-3)] py-[var(--space-1)] rounded-full text-xs font-black bg-blue-100 dark:bg-blue-500/15 text-[var(--primary)] border border-blue-200 dark:border-blue-500/30">
                      {selectedSeason === "1448"
                        ? "موسم حج 1448 هـ"
                        : "موسم حج 1447 هـ"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] font-bold mt-[var(--space-1)]">
                    {filterMode === "today"
                      ? "عرض السندات المسجلة اليوم فقط للموسم المحدد"
                      : `عرض كافة سندات ${selectedSeason === "1448" ? "موسم حج 1448 هـ" : "موسم حج 1447 هـ"}`}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-4)] w-full lg:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <input
                    type="text"
                    placeholder="بحث في السجل الحالي..."
                    value={tableSearchTerm}
                    onChange={(e) => setTableSearchTerm(e.target.value)}
                    className="w-full pl-[var(--space-12)] pr-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all shadow-sm"
                  />
                  <Activity
                    size={14}
                    className="absolute left-[var(--space-3)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  />
                </div>

                {/* Today / All Filter inside Operations Log */}
                <div className="flex items-center gap-[var(--space-2)] p-[var(--space-1)] bg-[var(--surface)] rounded-xl border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setFilterMode("all")}
                    className={`px-[var(--space-4)] py-[var(--space-2)] rounded-lg text-xs font-black transition-all cursor-pointer ${
                      filterMode === "all"
                        ? "bg-[var(--btn-primary)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                    }`}
                  >
                    الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode("today")}
                    className={`px-[var(--space-4)] py-[var(--space-2)] rounded-lg text-xs font-black transition-all cursor-pointer ${
                      filterMode === "today"
                        ? "bg-[var(--btn-primary)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                    }`}
                  >
                    اليوم
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[600px] relative">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 z-20 bg-[var(--surface)] text-[var(--text-secondary)] text-[13px] font-black border-b border-[var(--border)]">
                  <tr>
                    <th className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-4)]">رقم السند</th>
                    <th className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-4)]">بيانات الحافلة</th>
                    <th className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-4)]">السائق</th>
                    <th className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-4)] text-center">كود الاعتماد</th>
                    <th className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-4)]">أصدره</th>
                    <th className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-4)] text-center">التوقيت</th>
                    {canManage && (
                      <th className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-4)] text-left">الإجراءات</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  <AnimatePresence mode="popLayout">
                    {filteredTableData.map((v) => {
                      const timestampDate = v.timestamp ? new Date(v.timestamp) : null;
                      const isValidTimestamp =
                        timestampDate && !isNaN(timestampDate.getTime());

                      return (
                        <motion.tr
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          key={v.id}
                          className="hover:bg-[var(--surface-subtle)] transition-all group"
                        >
                          <td className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-5)]">
                            <div className="flex flex-col gap-[var(--space-1)]">
                              <span className="font-mono text-[var(--primary)] font-black text-sm tabular-nums">
                                #{v.voucherNumber}
                              </span>
                              <div className="flex items-center gap-[var(--space-1)] flex-wrap">
                                <span className="inline-block px-[var(--space-2)] py-[var(--space-1)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] rounded text-xs font-bold border border-[var(--border)] tabular-nums">
                                  {v.hajjSeason === "1448" ? "1448 هـ" : "1447 هـ"}
                                </span>
                                {v.archived && (
                                  <span className="inline-block px-[var(--space-2)] py-[var(--space-1)] bg-amber-50 dark:bg-amber-500/15 text-[var(--warning)] border border-amber-200 dark:border-amber-500/30 rounded text-xs font-bold">
                                    مؤرشف
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-5)]">
                            <div className="flex items-center gap-[var(--space-3)]">
                              <div className="min-w-10 h-10 px-[var(--space-2)] rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] flex items-center justify-center font-black text-[var(--text)] text-xs tabular-nums">
                                {v.busNumber || "---"}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-black text-[var(--text)]">
                                  {v.busType || "حافلة نقل"}
                                </span>
                                <span className="text-xs text-[var(--text-muted)] font-bold">
                                  {formatOfficeLabel(v)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-5)]">
                            <div className="flex items-center gap-[var(--space-2)]">
                              <div className="w-8 h-8 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-secondary)] font-black text-xs border border-[var(--border)]">
                                {v.driverName?.charAt(0) || "س"}
                              </div>
                              <span className="font-bold text-xs text-[var(--text)] truncate max-w-[150px]">
                                {v.driverName || "غير محدد"}
                              </span>
                            </div>
                          </td>
                          <td className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-5)] text-center">
                            <div className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-1)] bg-[var(--surface-subtle)] rounded-lg border border-[var(--border)]">
                              <span className="text-xs font-black text-[var(--text)] tabular-nums">
                                {v.approvalNumber || "---"}
                              </span>
                            </div>
                          </td>
                          <td className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-5)]">
                            <span className="text-[var(--text)] font-bold text-xs">
                              {resolveVoucherIssuerForUI(v, usersLookupMap)}
                            </span>
                          </td>
                          <td className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-5)]">
                            <div className="flex flex-col items-center">
                              <span className="font-black text-[var(--text)] text-xs tabular-nums">
                                {isValidTimestamp ? format(timestampDate, "HH:mm") : "--:--"}
                              </span>
                              <span className="text-xs text-[var(--text-muted)] font-bold tabular-nums mt-[var(--space-1)]">
                                {isValidTimestamp
                                  ? format(timestampDate, "yyyy/MM/dd")
                                  : v.customDate || v.dateKey || "---"}
                              </span>
                            </div>
                          </td>
                          {canManage && (
                            <td className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-5)] text-left">
                              <div className="flex items-center justify-end gap-[var(--space-2)]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingVoucher(v);
                                    setIsEditModalOpen(true);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-[var(--primary)] flex items-center justify-center hover:bg-[var(--btn-primary)] hover:text-white transition-all shadow-sm border border-blue-200 dark:border-blue-500/30 cursor-pointer"
                                  title="تعديل السند"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBusFromVoucher(v)}
                                  className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-500/15 text-[var(--danger)] flex items-center justify-center hover:bg-[#B91C1C] hover:text-white transition-all shadow-sm border border-red-200 dark:border-red-500/30 cursor-pointer"
                                  title="حذف حافلة/السند"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                  {filteredTableData.length === 0 && (
                    <tr>
                      <td
                        colSpan={canManage ? 7 : 6}
                        className="px-[var(--space-8)] py-[var(--space-16)] text-center"
                      >
                        <div className="w-16 h-16 bg-[var(--surface-subtle)] rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-4)] border border-dashed border-[var(--border)]">
                          <Bus className="text-[var(--text-muted)]" size={32} />
                        </div>
                        <p className="text-[var(--text-secondary)] font-black text-sm">
                          {tableSearchTerm
                            ? "لا توجد نتائج مطابقة لبحثك"
                            : "لا توجد عمليات مسجلة حالياً"}
                        </p>
                        <p className="text-[var(--text-muted)] text-xs font-bold mt-[var(--space-1)] mb-[var(--space-4)]">
                          {tableSearchTerm
                            ? "جرّب البحث بكلمات مختلفة أو رقم سند آخر"
                            : "ابدأ بإصدار أول سند ليظهر هنا مباشرة"}
                        </p>
                        {!tableSearchTerm && onNavigateToEntry && (
                          <button
                            type="button"
                            onClick={onNavigateToEntry}
                            className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm"
                          >
                            <PlusCircle size={16} />
                            <span>إصدار سند جديد</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Archiving Management Tools (Admins & Supervisors Only) */}
          {canManage && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] shadow-sm p-[var(--space-4)] lg:p-[var(--space-8)] space-y-[var(--space-8)] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
              {/* Main Season 1447 Archive & 1448 Season Transition Card */}
              <div className="bg-[var(--navy)] rounded-3xl p-[var(--space-4)] lg:p-[var(--space-8)] border border-slate-700 text-white shadow-lg relative overflow-hidden">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[var(--space-6)] relative z-10">
                  <div className="space-y-[var(--space-3)] max-w-2xl">
                    <div className="flex items-center gap-[var(--space-2)] flex-wrap">
                      <span className="px-[var(--space-3)] py-[var(--space-1)] rounded-full bg-white/10 text-slate-200 text-xs font-black border border-white/15 flex items-center gap-[var(--space-2)]">
                        <Archive size={14} />
                        أرشفة المواسم الرسمية
                      </span>
                      <span className="px-[var(--space-3)] py-[var(--space-1)] rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black border border-emerald-400/30 flex items-center gap-[var(--space-2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        الموسم النشط الحالي: حج {activeAppSeason} هـ
                      </span>
                    </div>
                    <h3 className="text-xl lg:text-2xl font-black text-white leading-snug">
                      أرشفة جميع السندات الحالية في تبويب موسم حج 1447 هـ وفتح موسم حج 1448 هـ
                    </h3>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      سيقوم هذا الإجراء بنقل وأرشفة كافة السندات والعمليات المسجلة حالياً وتوثيقها تحت{" "}
                      <strong>"موسم حج 1447 هـ"</strong> كأرشيف محفوظ، وتحرير كافة الحافلات لتكون شاغرة وجاهزة فوراً، وضبط النظام بشكل كامل لاستقبال عمليات{" "}
                      <strong>"موسم حج 1448 هـ"</strong> الجديدة.
                    </p>
                    <div className="flex items-center flex-wrap gap-[var(--space-4)] text-xs pt-[var(--space-1)] text-slate-200 font-bold tabular-nums">
                      <span>سندات موسم 1447 هـ: <strong>{season1447Count.toLocaleString("en-US")}</strong></span>
                      <span>|</span>
                      <span>سندات موسم 1448 هـ: <strong>{season1448Count.toLocaleString("en-US")}</strong></span>
                      <span>|</span>
                      <span>إجمالي السندات: <strong>{totalAllSeasonsCount.toLocaleString("en-US")}</strong></span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-3)] w-full lg:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsSeasonArchiveModalOpen(true)}
                      className="px-[var(--space-6)] py-[var(--space-4)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-black text-sm rounded-2xl shadow-lg flex items-center justify-center gap-[var(--space-2)] transition-all cursor-pointer active:scale-[0.98]"
                    >
                      <Sparkles size={18} />
                      <span>تنفيذ أرشفة موسم 1447 هـ وبدء موسم 1448 هـ</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-[var(--space-6)] border-b border-[var(--border)] pb-[var(--space-6)] pt-[var(--space-2)]">
                <div className="flex items-center gap-[var(--space-4)]">
                  <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/15 rounded-2xl flex items-center justify-center border border-amber-200 dark:border-amber-500/30">
                    <Calendar size={24} className="text-[var(--warning)]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-[var(--text)]">
                      أرشفة السندات حسب تاريخ محدد
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-1)]">
                      تفريغ الحافلات وتصفية السجلات النشطة حسب تاريخ يومي أو نطاق زمني
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50/60 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl text-[var(--text-secondary)] space-y-[var(--space-2)]">
                <h4 className="text-xs font-black text-[var(--warning)] flex items-center gap-[var(--space-2)]">
                  <AlertTriangle size={14} className="text-[var(--warning)]" />
                  <span>مفهوم وآلية الأرشفة وإعادة إتاحة الحافلات:</span>
                </h4>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  أرشفة السندات تقوم بتغيير حالة السند في النظام إلى{" "}
                  <strong className="text-[var(--text)] font-bold">"مؤرشف"</strong>. هذا الإجراء يقوم بـ{" "}
                  <strong className="text-[var(--primary)] font-bold">
                    تحرير الحافلات المرتبطة بها تلقائياً
                  </strong>{" "}
                  وإعادتها لحالة التوافر (جاهزة) لتتمكن من إدخالها في سندات جديدة على الفور، دون الحاجة لحذف السند أو التأثير على سجلاته التاريخية وإحصائياته العامة.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-6)] bg-[var(--surface-subtle)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl border border-[var(--border)]">
                <div>
                  <label className="block text-xs font-black text-[var(--text-muted)] px-[var(--space-1)] mb-[var(--space-2)]">
                    تحديد تاريخ الأرشفة المستهدف
                  </label>
                  <input
                    type="date"
                    value={archiveTargetDate}
                    onChange={(e) => setArchiveTargetDate(e.target.value)}
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-black text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all text-sm outline-none shadow-sm tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[var(--text-muted)] px-[var(--space-1)] mb-[var(--space-2)]">
                    نطاق الأرشفة والمطابقة
                  </label>
                  <div className="flex gap-[var(--space-4)]">
                    <button
                      type="button"
                      onClick={() => setArchiveMode("older")}
                      className={`flex-1 py-[var(--space-3)] px-[var(--space-4)] rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                        archiveMode === "older"
                          ? "bg-[var(--btn-primary)] text-white border-[var(--btn-primary)] shadow-sm"
                          : "bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                      }`}
                    >
                      هذا التاريخ وتاريخ ما قبله (الكل)
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveMode("exact")}
                      className={`flex-1 py-[var(--space-3)] px-[var(--space-4)] rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                        archiveMode === "exact"
                          ? "bg-[var(--btn-primary)] text-white border-[var(--btn-primary)] shadow-sm"
                          : "bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                      }`}
                    >
                      هذا التاريخ المحدد فقط
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-[var(--space-4)]">
                <h3 className="text-xs font-black text-[var(--text)] px-[var(--space-1)]">
                  السندات التي تطابق الاختيار والتاريخ (غير مؤرشفة حالياً):
                </h3>

                {matchingVouchers.length > 0 ? (
                  <div className="space-y-[var(--space-4)]">
                    <div className="flex items-center gap-[var(--space-3)] p-[var(--space-4)] bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-2xl text-[var(--warning)]">
                      <AlertTriangle className="text-[var(--warning)] shrink-0" size={18} />
                      <span className="text-xs font-black tabular-nums">
                        تم العثور على عدد {matchingVouchers.length.toLocaleString("en-US")} سند نشط وغير مؤرشف يطابق الفئات المختارة. هل ترغب في أرشفتها الآن لإعادة إتاحة حافلاتها؟
                      </span>
                    </div>

                    <div className="border border-[var(--border)] rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto bg-[var(--surface)] shadow-inner">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[var(--surface-subtle)] text-[var(--text-secondary)] text-[13px] font-black sticky top-0 text-right border-b border-[var(--border)]">
                          <tr>
                            <th className="px-[var(--space-6)] py-[var(--space-4)] text-right">رقم السند</th>
                            <th className="px-[var(--space-6)] py-[var(--space-4)] text-right">أرقام الحافلات</th>
                            <th className="px-[var(--space-6)] py-[var(--space-4)] text-right">أصدره</th>
                            <th className="px-[var(--space-6)] py-[var(--space-4)] text-right">التاريخ الفعلي</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {matchingVouchers.map((v) => {
                            const busNums =
                              v.buses && Array.isArray(v.buses)
                                ? v.buses.map((b: any) => b.busNumber).join(", ")
                                : v.busNumber;
                            return (
                              <tr key={v.id} className="hover:bg-[var(--surface-subtle)]">
                                <td className="px-[var(--space-6)] py-[var(--space-4)] font-mono font-black text-[var(--primary)] tabular-nums">
                                  #{v.voucherNumber}
                                </td>
                                <td className="px-[var(--space-6)] py-[var(--space-4)] font-bold text-[var(--text)] tabular-nums">
                                  {busNums || "---"}
                                </td>
                                <td className="px-[var(--space-6)] py-[var(--space-4)] text-[var(--text-secondary)]">
                                  {resolveVoucherIssuerForUI(v, usersLookupMap)}
                                </td>
                                <td className="px-[var(--space-6)] py-[var(--space-4)] text-[var(--text-secondary)] tabular-nums">
                                  {v.customDate || v.dateKey}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-[var(--space-4)]">
                      <button
                        type="button"
                        onClick={() => setIsArchiveModalOpen(true)}
                        disabled={isArchivingInProgress}
                        className="w-full md:w-auto bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-black text-xs px-[var(--space-8)] py-[var(--space-4)] rounded-2xl shadow-lg flex items-center justify-center gap-[var(--space-2)] transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isArchivingInProgress ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={18} />
                        )}
                        <span className="tabular-nums">
                          أرشفة عدد {matchingVouchers.length.toLocaleString("en-US")} سند وتحرير الحافلات فوراً
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-[var(--space-12)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl">
                    <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/15 rounded-2xl flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30 mb-[var(--space-4)]">
                      <CheckCircle2 size={26} className="text-[var(--success)]" />
                    </div>
                    <p className="text-[var(--text-secondary)] font-black text-xs">
                      لا توجد سندات نشطة مطابقة للاختيار والتاريخ
                    </p>
                    <p className="text-[var(--text-muted)] text-xs font-bold mt-[var(--space-1)]">
                      كافة السندات في هذا النطاق مؤرشفة بالفعل أو لا توجد سندات مسجلة.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingVoucher && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative z-10 border border-[var(--border)]"
            >
              <div className="bg-[var(--navy)] px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-6)] text-white flex justify-between items-center">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-10 h-10 bg-[var(--btn-primary)] rounded-xl flex items-center justify-center">
                    <Edit2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">تعديل بيانات السند</h3>
                    <p className="text-xs text-slate-300 font-bold tabular-nums">
                      سند رقم #{editingVoucher.voucherNumber}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateVoucher} className="p-[var(--space-4)] lg:p-[var(--space-8)] space-y-[var(--space-5)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-5)]">
                  <div>
                    <label className="block text-xs font-black text-[var(--text-muted)] px-[var(--space-1)] mb-[var(--space-2)]">
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
                      className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl font-black text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[var(--text-muted)] px-[var(--space-1)] mb-[var(--space-2)]">
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
                      className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl font-black text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-[var(--text-muted)] px-[var(--space-1)] mb-[var(--space-2)]">
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
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl font-bold text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[var(--text-muted)] px-[var(--space-1)] mb-[var(--space-2)]">
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
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl font-bold text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
                  >
                    <option value="حافلة كبيرة">حافلة كبيرة</option>
                    <option value="حافلة صغيرة">حافلة صغيرة</option>
                    <option value="فان">فان</option>
                  </select>
                </div>

                <div className="pt-[var(--space-4)] flex gap-[var(--space-3)]">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 bg-[var(--btn-primary)] text-white font-black py-[var(--space-4)] rounded-2xl shadow-lg hover:bg-[var(--btn-primary-hover)] transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50 text-xs cursor-pointer"
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
                    className="px-[var(--space-6)] py-[var(--space-4)] border border-[var(--border)] text-[var(--text-secondary)] font-bold rounded-2xl hover:bg-[var(--surface-subtle)] transition-all text-xs cursor-pointer"
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
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-500/15 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-6)] border border-red-200 dark:border-red-500/30">
                <Trash2 size={32} className="text-[var(--danger)]" />
              </div>

              <h3 className="text-xl font-black text-[var(--text)] mb-[var(--space-2)]">
                تأكيد حذف السند
              </h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-[var(--space-8)] px-[var(--space-4)]">
                هل أنت متأكد من رغبتك في حذف السند رقم{" "}
                <span className="font-bold text-[var(--danger)] tabular-nums">
                  #{voucherToDelete.voucherNumber}
                </span>
                ؟ سيؤدي هذا الإجراء إلى حذف كافة بيانات السند نهائياً وتحرير الحافلة.
              </p>

              <div className="flex gap-[var(--space-3)]">
                <button
                  type="button"
                  onClick={handleDeleteVoucher}
                  disabled={isDeleting}
                  className="flex-1 bg-[var(--danger)] text-white font-black py-[var(--space-4)] rounded-2xl shadow-lg hover:bg-red-800 transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50 text-xs cursor-pointer"
                >
                  {isDeleting ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                  <span>نعم، حذف السند</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="px-[var(--space-6)] py-[var(--space-4)] border border-[var(--border)] text-[var(--text-secondary)] font-bold rounded-2xl hover:bg-[var(--surface-subtle)] transition-all disabled:opacity-50 text-xs cursor-pointer"
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
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
            >
              <div className="w-20 h-20 bg-amber-50 dark:bg-amber-500/15 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-6)] border border-amber-200 dark:border-amber-500/30">
                <Calendar size={32} className="text-[var(--warning)]" />
              </div>

              <h3 className="text-xl font-black text-[var(--text)] mb-[var(--space-2)]">
                تأكيد أرشفة السندات
              </h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-[var(--space-8)] px-[var(--space-4)]">
                هل أنت متأكد من أرشفة عدد{" "}
                <span className="font-bold text-[var(--warning)] tabular-nums">
                  {matchingVouchers.length.toLocaleString("en-US")}
                </span>{" "}
                من السندات؟ بعد الأرشفة، ستصبح الحافلات المرتبطة بها متاحة فوراً للاستخدام وسجلات السندات ستشير إليها كمؤرشفة.
              </p>

              <div className="flex gap-[var(--space-3)]">
                <button
                  type="button"
                  onClick={handleExecuteArchive}
                  disabled={isArchivingInProgress}
                  className="flex-1 bg-[var(--btn-primary)] text-white font-black py-[var(--space-4)] rounded-2xl shadow-lg hover:bg-[var(--btn-primary-hover)] transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50 text-xs cursor-pointer"
                >
                  {isArchivingInProgress ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  <span>نعم، تنفيذ الأرشفة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsArchiveModalOpen(false)}
                  disabled={isArchivingInProgress}
                  className="px-[var(--space-6)] py-[var(--space-4)] border border-[var(--border)] text-[var(--text-secondary)] font-bold rounded-2xl hover:bg-[var(--surface-subtle)] transition-all disabled:opacity-50 text-xs cursor-pointer"
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
            >
              <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/15 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-6)] border border-emerald-200 dark:border-emerald-500/30">
                <CheckCircle2 size={32} className="text-[var(--success)]" />
              </div>

              <h3 className="text-xl font-black text-[var(--text)] mb-[var(--space-2)]">
                تمت الأرشفة بنجاح
              </h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-[var(--space-8)] px-[var(--space-4)]">
                تمت أرشفة عدد{" "}
                <span className="font-bold text-[var(--success)] tabular-nums">
                  {archivedCount.toLocaleString("en-US")}
                </span>{" "}
                من السندات المحددة بنجاح. لقد تم إخلاء الحافلات المرتبطة بها وهي الآن{" "}
                <span className="text-[var(--success)] font-bold">
                  جاهزة في النظام
                </span>{" "}
                للاستخدام مجدداً فوراً.
              </p>

              <button
                type="button"
                onClick={() => setIsArchiveSuccessModalOpen(false)}
                className="w-full bg-[var(--navy)] text-white font-black py-[var(--space-4)] rounded-2xl shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-[var(--space-2)] text-xs cursor-pointer"
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
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
            >
              <div className="w-20 h-20 bg-[var(--primary)] rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-6)] shadow-xl text-white">
                <Archive size={36} />
              </div>

              <div className="flex items-center justify-center gap-[var(--space-2)] mb-[var(--space-2)]">
                <span className="px-[var(--space-3)] py-[var(--space-1)] rounded-full text-xs font-black bg-blue-50 dark:bg-blue-500/15 text-[var(--primary)] border border-blue-200 dark:border-blue-500/30">
                  إجراء رسمي للمواسم
                </span>
              </div>

              <h3 className="text-2xl font-black text-[var(--text)] mb-[var(--space-2)]">
                أرشفة موسم حج 1447 هـ وفتح موسم 1448 هـ
              </h3>

              <p className="text-[var(--text-secondary)] text-xs leading-relaxed mb-[var(--space-6)] px-[var(--space-2)]">
                سيقوم هذا الإجراء بنقل وأرشفة كافة السندات والعمليات السابقة وتوثيقها تحت{" "}
                <strong className="text-[var(--text)] font-black">"موسم حج 1447 هـ"</strong> في الأرشيف الدائم، وتحرير جميع الحافلات وإعادتها فوراً لحالة التوفر لتكون جاهزة لـ{" "}
                <strong className="text-[var(--primary)] font-black">"موسم حج 1448 هـ"</strong> الجديد.
              </p>

              <div className="bg-[var(--surface-subtle)] p-[var(--space-4)] rounded-2xl border border-[var(--border)] text-right space-y-[var(--space-2)] mb-[var(--space-6)] text-xs font-semibold text-[var(--text-secondary)]">
                <div className="flex justify-between items-center py-[var(--space-1)] border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">إجمالي السندات الحالية:</span>
                  <span className="font-mono font-black text-[var(--text)] tabular-nums">
                    {totalAllSeasonsCount.toLocaleString("en-US")} سند
                  </span>
                </div>
                <div className="flex justify-between items-center py-[var(--space-1)] border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">الوجهة الأرشيفية:</span>
                  <span className="font-black text-[var(--text)]">موسم حج 1447 هـ</span>
                </div>
                <div className="flex justify-between items-center py-[var(--space-1)]">
                  <span className="text-[var(--text-muted)]">الموسم النشط بعد التنفيذ:</span>
                  <span className="font-black text-[var(--primary)]">موسم حج 1448 هـ</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-[var(--space-3)]">
                <button
                  type="button"
                  onClick={handleExecuteSeasonArchive}
                  disabled={isSeasonArchiving}
                  className="flex-1 bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-black py-[var(--space-4)] rounded-2xl shadow-lg transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50 text-xs cursor-pointer"
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
                  type="button"
                  onClick={() => setIsSeasonArchiveModalOpen(false)}
                  disabled={isSeasonArchiving}
                  className="px-[var(--space-6)] py-[var(--space-4)] border border-[var(--border)] text-[var(--text-secondary)] font-bold rounded-2xl hover:bg-[var(--surface-subtle)] transition-all disabled:opacity-50 text-xs cursor-pointer"
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
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-emerald-200 dark:border-emerald-500/30 text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
            >
              <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/15 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-6)] border border-emerald-200 dark:border-emerald-500/30">
                <CheckCircle2 size={36} className="text-[var(--success)]" />
              </div>

              <div className="flex items-center justify-center gap-[var(--space-2)] mb-[var(--space-2)]">
                <span className="px-[var(--space-3)] py-[var(--space-1)] rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-500/15 text-[var(--success)] border border-emerald-300 dark:border-emerald-500/30">
                  تم بنجاح تام
                </span>
              </div>

              <h3 className="text-2xl font-black text-[var(--text)] mb-[var(--space-2)]">
                مرحباً بموسم حج 1448 هـ!
              </h3>

              <p className="text-[var(--text-secondary)] text-xs leading-relaxed mb-[var(--space-6)] px-[var(--space-2)]">
                تمت أرشفة وتوثيق عدد{" "}
                <span className="font-bold text-[var(--success)] font-mono text-sm tabular-nums">
                  {seasonArchiveResult.totalArchived.toLocaleString("en-US")}
                </span>{" "}
                سنداً بنجاح في تبويب <strong>"موسم حج 1447 هـ"</strong>. وتم تفريغ وتحرير كافة الحافلات لتصبح جاهزة بنسبة 100% لإصدار سندات <strong>موسم حج 1448 هـ</strong> الجديد.
              </p>

              <button
                type="button"
                onClick={() => setIsSeasonArchiveSuccessModalOpen(false)}
                className="w-full bg-[var(--btn-primary)] text-white font-black py-[var(--space-4)] rounded-2xl shadow-lg hover:bg-[var(--btn-primary-hover)] transition-all flex items-center justify-center gap-[var(--space-2)] text-xs cursor-pointer"
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-500/15 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-6)] border border-red-200 dark:border-red-500/30">
                <AlertTriangle size={32} className="text-[var(--danger)]" />
              </div>

              <h3 className="text-xl font-black text-[var(--text)] mb-[var(--space-2)]">
                فشلت عملية الأرشفة
              </h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-[var(--space-8)] px-[var(--space-4)]">
                واجه النظام خطأً أثناء الأرشفة:
                <br />
                <span className="text-[var(--danger)] font-mono text-xs block mt-[var(--space-2)] p-[var(--space-2)] bg-[var(--surface-subtle)] rounded border border-[var(--border)]">
                  {archiveErrorMsg}
                </span>
              </p>

              <button
                type="button"
                onClick={() => setIsArchiveErrorModalOpen(false)}
                className="w-full bg-[var(--danger)] text-white font-black py-[var(--space-4)] rounded-2xl shadow-lg hover:bg-red-800 transition-all flex items-center justify-center gap-[var(--space-2)] text-xs cursor-pointer"
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-[var(--space-4)]">
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
              className="bg-[var(--surface)] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] p-[var(--space-4)] lg:p-[var(--space-8)] flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-[var(--space-6)] border-b border-[var(--border)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 text-[var(--primary)]">
                    <Bus size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[var(--text)] leading-tight">
                      {busDetailModalMode === "today"
                        ? "الحافلات الموزعة اليوم"
                        : `الحافلات الموزعة بالفترة من ${distributedBusesStartDate} إلى ${distributedBusesEndDate}`}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-1)]">
                      {busDetailModalMode === "today"
                        ? "تفاصيل الحافلات الموزعة ضمن العقود الحالية لهذا اليوم"
                        : `سجل نشاط الحافلات الموزعة في العقود للفترة من ${distributedBusesStartDate} إلى ${distributedBusesEndDate}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBusDetailModalOpen(false)}
                  className="w-10 h-10 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative my-[var(--space-4)]">
                <input
                  type="text"
                  placeholder="ابحث برقم الحافلة، اسم السائق، أو رقم السند..."
                  value={busModalSearchTerm}
                  onChange={(e) => setBusModalSearchTerm(e.target.value)}
                  className="w-full bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl py-[var(--space-3)] px-[var(--space-4)] text-xs font-semibold text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] text-right"
                  dir="rtl"
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto pr-[var(--space-1)] space-y-[var(--space-3)] pb-[var(--space-4)]">
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
                      <div className="text-center py-[var(--space-12)]">
                        <p className="text-[var(--text-muted)] font-bold text-xs">
                          لا توجد حافلات موزعة مطابقة للبحث
                        </p>
                      </div>
                    );
                  }

                  return filtered.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-[var(--space-4)] rounded-2xl border border-[var(--border)] hover:border-[var(--primary)]/40 bg-[var(--surface-subtle)] transition-all flex flex-col md:flex-row md:items-center justify-between gap-[var(--space-4)] text-right"
                      dir="rtl"
                    >
                      <div className="space-y-[var(--space-2)] flex-1">
                        <div className="flex items-center gap-[var(--space-2)]">
                          <span className="text-xs bg-[var(--navy)] text-white font-black px-[var(--space-2)] py-[var(--space-1)] rounded-lg tabular-nums">
                            حافلة رقم #{item.busNumber}
                          </span>
                          <span className="text-xs bg-[var(--surface)] text-[var(--text-secondary)] font-bold px-[var(--space-2)] py-[var(--space-1)] rounded-lg border border-[var(--border)]">
                            {item.busType}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-[var(--space-4)] gap-y-[var(--space-1)] text-xs text-[var(--text-secondary)] font-semibold pt-[var(--space-1)]">
                          <p>
                            السائق:{" "}
                            <span className="font-bold text-[var(--text)]">
                              {item.driverName}
                            </span>
                          </p>
                          {item.driverPhone && (
                            <p>
                              الهاتف:{" "}
                              <span className="font-bold text-[var(--text)] dir-ltr tabular-nums">
                                {item.driverPhone}
                              </span>
                            </p>
                          )}
                          <p>
                            المندوب:{" "}
                            <span className="font-bold text-[var(--text)]">
                              {item.delegateName}
                            </span>
                          </p>
                          <p>
                            عدد الحجاج:{" "}
                            <span className="font-bold text-[var(--text)] tabular-nums">
                              {Number(item.pilgrimsCount || 0).toLocaleString("en-US")}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-[var(--space-1)] border-t md:border-t-0 pt-[var(--space-2)] md:pt-0 border-[var(--border)]">
                        <span className="text-xs text-[var(--text-muted)] font-bold">
                          رقم السند المرتبط
                        </span>
                        <span className="text-xs bg-blue-50 dark:bg-blue-500/15 text-[var(--primary)] font-black px-[var(--space-3)] py-[var(--space-1)] rounded-xl border border-blue-200 dark:border-blue-500/30 tabular-nums">
                          #{item.voucherNumber}
                        </span>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="pt-[var(--space-4)] border-t border-[var(--border)] flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsBusDetailModalOpen(false)}
                  className="px-[var(--space-6)] py-[var(--space-3)] bg-[var(--navy)] hover:bg-slate-800 text-white font-black text-xs rounded-xl transition-all cursor-pointer shadow-lg"
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
