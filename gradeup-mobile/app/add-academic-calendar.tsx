import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { readUriAsBase64 } from "@/src/lib/readUriAsBase64";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/src/context/AppContext";
import { supabase } from "@/src/lib/supabase";
import { TextInput } from "react-native-gesture-handler";
import { getUniversityById } from "@/src/lib/universities";
import { submitUitmCalendarContribution } from "@/src/lib/uitmCalendarContributionsDb";

export default function AddAcademicCalendarScreen() {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { user } = useApp();

  const [busy, setBusy] = useState(false);
  const [formVisible, setFormVisible] = useState(false);

  // Form Fields
  const [programLevel, setProgramLevel] = useState("General");
  const [semesterLabel, setSemesterLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalWeeks, setTotalWeeks] = useState("");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [periodsJson, setPeriodsJson] = useState("[]");

  const handlePickDocument = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const fileUri = res.assets[0].uri;

      setBusy(true);
      const base64 = await readUriAsBase64(fileUri);

      const { data, error } = await supabase.functions.invoke("user_tools", {
        body: { action: "extract_calendar_from_pdf", pdfBase64: base64 },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      applyExtracted(data?.extracted);
    } catch (e) {
      Alert.alert(
        "Extraction Failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const handlePickImage = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      if (!asset.base64) throw new Error("Image could not be read.");

      setBusy(true);
      const mime = asset.mimeType ?? "image/jpeg";
      const base64Str = `data:${mime};base64,${asset.base64}`;

      const { data, error } = await supabase.functions.invoke("user_tools", {
        body: { action: "extract_calendar_from_image", imageBase64: base64Str },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      applyExtracted(data?.extracted);
    } catch (e) {
      Alert.alert(
        "Extraction Failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const applyExtracted = (extracted: any) => {
    if (
      !extracted ||
      !Array.isArray(extracted.candidates) ||
      extracted.candidates.length === 0
    ) {
      Alert.alert(
        "No data",
        "Could not parse calendar data. Please enter manually.",
      );
      setFormVisible(true);
      return;
    }
    const cand = extracted.candidates[0]; // Auto-pick the first one
    setProgramLevel(cand.program_level || "General");
    setSemesterLabel(cand.semester_label || "");
    setStartDate(cand.start_date || "");
    setEndDate(cand.end_date || "");
    setTotalWeeks(cand.total_weeks ? String(cand.total_weeks) : "");
    setBreakStart(cand.break_start_date || "");
    setBreakEnd(cand.break_end_date || "");
    setPeriodsJson(JSON.stringify(cand.periods || [], null, 2));
    setFormVisible(true);
    Alert.alert(
      "Success",
      "Extracted calendar dates. Please review and publish.",
    );
  };

  const handleManualEntry = () => {
    setFormVisible(true);
  };

  const submitCalendar = async () => {
    const userId = user.id;
    if (!user.universityId || !userId) {
      Alert.alert("Error", "You must have a university set in your profile.");
      return;
    }
    if (!semesterLabel || !startDate || !endDate) {
      Alert.alert(
        "Error",
        "Semester Label, Start Date, and End Date are required.",
      );
      return;
    }

    setBusy(true);
    try {
      let periods = [];
      try {
        periods = JSON.parse(periodsJson);
      } catch {
        throw new Error("Periods JSON is invalid.");
      }

      const isUitm = user.universityId === "uitm";
      const start = startDate.trim().slice(0, 10);
      const end = endDate.trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
        throw new Error("Enter valid dates in YYYY-MM-DD format.");
      }

      if (isUitm) {
        await submitUitmCalendarContribution({
          userId,
          groupCode: user.academicLevel === "Foundation" ? "A" : "B",
          semesterLabel: semesterLabel.trim(),
          startDate: start,
          endDate: end,
          totalWeeks: parseInt(totalWeeks, 10) || 14,
          ...(breakStart.trim() ? { breakStartDate: breakStart.trim() } : {}),
          ...(breakEnd.trim() ? { breakEndDate: breakEnd.trim() } : {}),
          periods,
        });
        Alert.alert(
          "Sent for review",
          "Your UiTM calendar was sent to the admin team. It will not change anyone’s planner unless an admin approves it and each student chooses to apply it.",
          [{ text: "OK", onPress: () => router.back() }],
        );
        return;
      }

      let resolvedCampusId = null;
      if (user.campus && user.campus !== "-" && user.campus.length > 2) {
        const { data: campusData } = await supabase
          .from("campuses")
          .select("id")
          .eq("name", user.campus)
          .eq("university_id", user.universityId)
          .single();
        if (campusData?.id) {
          resolvedCampusId = campusData.id;
        }
      }

      const payload = {
        university_id: user.universityId,
        campus_id: resolvedCampusId, // Ensure campus matches user's profile as a valid UUID
        semester_label: semesterLabel.trim(),
        start_date: start,
        end_date: end,
        total_weeks: parseInt(totalWeeks) || 14,
        break_start_date: breakStart.trim() || null,
        break_end_date: breakEnd.trim() || null,
        periods_json: periods,
        source: "crowdsourced",
        created_by: userId,
      };

      const { error } = await supabase
        .from("university_calendar_offers")
        .insert([payload]);

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "This calendar already exists for your university/campus.",
          );
        }
        throw new Error(error.message);
      }

      Alert.alert(
        "Success",
        "Calendar published successfully! You and others can now select it in the Academic Calendar settings.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert(
        "Publish Failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.safe}>
      <View style={[s.header, { paddingTop: Math.max(10, insets.top) }]}>
        <Pressable
          style={s.headerBtn}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={s.title}>Add Academic Calendar</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.desc}>
          {user.universityId === "uitm"
            ? "Submit a UiTM calendar update for admin review. It will never automatically change anyone’s planner. Upload an official calendar where possible, or enter the details manually."
            : "Upload your university's official academic calendar as a PDF or image, and we'll extract the dates automatically! You can also enter the details manually."}
        </Text>

        {!formVisible && (
          <View style={s.actionsContainer}>
            <Pressable
              style={[
                s.actionBtn,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
              onPress={handlePickDocument}
              disabled={busy}
            >
              <Feather name="file-text" size={24} color={theme.primary} />
              <View style={s.actionTextContainer}>
                <Text style={[s.actionTitle, { color: theme.text }]}>
                  Upload PDF
                </Text>
                <Text style={[s.actionSub, { color: theme.textSecondary }]}>
                  Select a PDF file from your device
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                s.actionBtn,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
              onPress={handlePickImage}
              disabled={busy}
            >
              <Feather name="image" size={24} color={theme.primary} />
              <View style={s.actionTextContainer}>
                <Text style={[s.actionTitle, { color: theme.text }]}>
                  Upload Image
                </Text>
                <Text style={[s.actionSub, { color: theme.textSecondary }]}>
                  Select an image or screenshot
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                s.actionBtn,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
              onPress={handleManualEntry}
              disabled={busy}
            >
              <Feather name="edit-2" size={24} color={theme.primary} />
              <View style={s.actionTextContainer}>
                <Text style={[s.actionTitle, { color: theme.text }]}>
                  Enter Manually
                </Text>
                <Text style={[s.actionSub, { color: theme.textSecondary }]}>
                  Type the dates yourself
                </Text>
              </View>
            </Pressable>

            {busy && (
              <ActivityIndicator
                style={{ marginTop: 20 }}
                color={theme.primary}
              />
            )}
          </View>
        )}

        {formVisible && (
          <View
            style={[
              s.form,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[s.formHeader, { color: theme.text }]}>
              Review Calendar Details
            </Text>

            <Text style={[s.label, { color: theme.textSecondary }]}>
              Semester Label (e.g. Semester 1 2025/2026)
            </Text>
            <TextInput
              style={[
                s.input,
                { color: theme.text, borderColor: theme.border },
              ]}
              value={semesterLabel}
              onChangeText={setSemesterLabel}
            />

            <Text style={[s.label, { color: theme.textSecondary }]}>
              Start Date (YYYY-MM-DD)
            </Text>
            <TextInput
              style={[
                s.input,
                { color: theme.text, borderColor: theme.border },
              ]}
              value={startDate}
              onChangeText={setStartDate}
            />

            <Text style={[s.label, { color: theme.textSecondary }]}>
              End Date (YYYY-MM-DD)
            </Text>
            <TextInput
              style={[
                s.input,
                { color: theme.text, borderColor: theme.border },
              ]}
              value={endDate}
              onChangeText={setEndDate}
            />

            <Text style={[s.label, { color: theme.textSecondary }]}>
              Total Weeks
            </Text>
            <TextInput
              style={[
                s.input,
                { color: theme.text, borderColor: theme.border },
              ]}
              value={totalWeeks}
              onChangeText={setTotalWeeks}
              keyboardType="numeric"
            />

            <Text style={[s.label, { color: theme.textSecondary }]}>
              Break Start Date (Optional)
            </Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, opacity: 0.8, marginBottom: 8, marginTop: -4 }}>
              This is for the mid-semester break only (do not include the end-of-semester break).
            </Text>
            <TextInput
              style={[
                s.input,
                { color: theme.text, borderColor: theme.border },
              ]}
              value={breakStart}
              onChangeText={setBreakStart}
            />

            <Text style={[s.label, { color: theme.textSecondary }]}>
              Break End Date (Optional)
            </Text>
            <TextInput
              style={[
                s.input,
                { color: theme.text, borderColor: theme.border },
              ]}
              value={breakEnd}
              onChangeText={setBreakEnd}
            />

            <Pressable
              style={[s.submitBtn, { backgroundColor: theme.primary }]}
              onPress={submitCalendar}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <Text style={[s.submitText, { color: theme.textInverse }]}>
                  {user.universityId === "uitm" ? "Send for admin review" : "Publish Calendar"}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function styles(theme: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { fontSize: 20, fontWeight: "900", color: theme.text },
    content: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 10 },
    desc: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.textSecondary,
      marginBottom: 20,
      lineHeight: 22,
    },
    actionsContainer: { gap: 12 },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
    },
    actionTextContainer: { marginLeft: 16, flex: 1 },
    actionTitle: { fontSize: 16, fontWeight: "800" },
    actionSub: { fontSize: 12, fontWeight: "600", marginTop: 2 },
    form: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
    formHeader: { fontSize: 18, fontWeight: "900", marginBottom: 4 },
    label: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 4,
    },
    input: {
      height: 44,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      fontWeight: "600",
    },
    submitBtn: {
      height: 50,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    submitText: { fontSize: 16, fontWeight: "800" },
  });
}
