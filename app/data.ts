import type { CharacterProfile, DailyExpRecord, DrawingSubmission } from "./lounge/types";
import type { BaySchedule } from "./bay/model";
import type { CommonEvent, CommonResponse } from "./common-events/model";

export type AbsenceType = "annual" | "training" | "flex" | "family" | "etc";

export type Member = {
  id: string;
  name: string;
  color: string;
  active: boolean;
};

export type Equipment = {
  id: string;
  name: string;
  category: string;
};

export type Absence = {
  id: string;
  memberId: string;
  startDate: string;
  endDate: string;
  type: AbsenceType;
  label: string;
  memo: string;
  flexTime?: string;
};

export type OvertimeAvailability = {
  id: string;
  memberId: string;
  date: string;
};

export type OvertimeAssignment = {
  id: string;
  memberId: string;
  date: string;
  method: "self" | "agree" | "random";
};

export type OvertimeLog = {
  id: string;
  date: string;
  memberId: string;
  memberName: string;
  action: "assigned" | "removed";
  method: "self" | "agree" | "random";
  actor: string;
  at: string;
};

export type EquipmentBlock = {
  id: string;
  equipmentId: string;
  startDate: string;
  endDate: string;
  reason: string;
  reporterId: string | null;
};

export type AuditLog = {
  id: string;
  at: string;
  actor: string;
  action: string;
};

export type FeedbackReply = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
};

export type FeedbackComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  replies: FeedbackReply[];
};

export type FeedbackPost = {
  id: string;
  author: string;
  title: string;
  body: string;
  comments: FeedbackComment[];
  createdAt: string;
  updatedAt: string;
};

export type AppData = {
  baySchedules: BaySchedule[];
  commonEvents: CommonEvent[];
  commonResponses: CommonResponse[];
  members: Member[];
  equipments: Equipment[];
  absences: Absence[];
  availability: OvertimeAvailability[];
  assignments: OvertimeAssignment[];
  overtimeLogs: OvertimeLog[];
  equipmentBlocks: EquipmentBlock[];
  auditLogs: AuditLog[];
  feedbacks: FeedbackPost[];
  dashboardComments: FeedbackComment[];
  characterProfiles: CharacterProfile[];
  dailyCharacterExp: DailyExpRecord[];
  drawingSubmissions: DrawingSubmission[];
};

export const absenceLabels: Record<AbsenceType, string> = {
  annual: "연차",
  training: "교육",
  flex: "자출",
  family: "패밀리데이",
  etc: "기타",
};

export const absenceColors: Record<AbsenceType, string> = {
  annual: "#16A085",
  training: "#8E44AD",
  flex: "#F39C12",
  family: "#1428A0",
  etc: "#717171",
};

export const swatches = [
  "#1428A0",
  "#FF6B4A",
  "#16A085",
  "#8E44AD",
  "#F39C12",
  "#E74C3C",
  "#2E86C1",
  "#717171",
  "#27AE60",
  "#34495E",
];

export const reservedMemberNames = ["관리자", "미지정"];

export const initialData: AppData = {
  baySchedules: [],
  commonEvents: [],
  commonResponses: [],
  members: [],
  equipments: [],
  absences: [],
  availability: [],
  assignments: [],
  overtimeLogs: [],
  equipmentBlocks: [],
  auditLogs: [],
  feedbacks: [],
  dashboardComments: [],
  characterProfiles: [],
  dailyCharacterExp: [],
  drawingSubmissions: [],
};
