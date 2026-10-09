/**
 * Which job rows a user is shown.
 *
 * A job blacklisted by company is kept in the database -- it is what stops the
 * same URL being re-added on the next paste, and it records WHY the company was
 * blocked -- but it is not a result. Listing it means every paste that touches a
 * blacklisted employer leaves rows the user has to scroll past and cannot act on.
 *
 * Hidden rather than deleted, and hidden in ONE place so the dashboard, search
 * and the calendar counts cannot drift apart. The count of how many were
 * excluded is still reported when URLs are added, so a blocked job is explained
 * rather than silently vanishing.
 */
export const HIDDEN_JOB_STATUS = "excluded";

/** Prisma `where` fragment that drops hidden rows. Spread into an existing where. */
export const visibleJobWhere = { status: { not: HIDDEN_JOB_STATUS } } as const;

/** True when a row should be shown. Takes the LIVE status where one exists, so a
 *  job that turns excluded mid-run disappears without waiting for a reload. */
export function isVisibleJobStatus(status: string | null | undefined): boolean {
  return (status ?? "") !== HIDDEN_JOB_STATUS;
}
