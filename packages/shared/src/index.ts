export {
  academicPeriodCreateSchema,
  academicPeriodDeletionResultSchema,
  academicPeriodSchema,
  academicPeriodUpdateSchema,
  academicWorkspaceSchema,
  academicYearDeletionResultSchema,
  academicYearInputSchema,
  academicYearSchema,
  deleteAcademicPeriodInputSchema,
  deleteAcademicYearInputSchema,
  deleteSubjectInputSchema,
  subjectCreateSchema,
  subjectDeletionResultSchema,
  subjectSchema,
  subjectUpdateSchema,
} from "./schemas/academic.js";
export type {
  AcademicPeriod,
  AcademicWorkspace,
  AcademicYear,
  Subject,
} from "./schemas/academic.js";
export {
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas/auth.js";
export type {
  ForgotPasswordInput,
  Profile,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
} from "./schemas/auth.js";
export { healthResponseSchema } from "./schemas/health.js";
export type { HealthResponse } from "./schemas/health.js";
