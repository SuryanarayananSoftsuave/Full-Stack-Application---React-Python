import styles from "../DashboardPage.module.css";

export function KpiCard({ icon, label, value, accent = "blue", subtext }) {
  return (
    <div className={`${styles.kpiCard} ${styles[`accent_${accent}`]}`}>
      <div className={styles.kpiIcon}>{icon}</div>
      <div className={styles.kpiBody}>
        <div className={styles.kpiLabel}>{label}</div>
        <div className={styles.kpiValue}>{value}</div>
        {subtext && <div className={styles.kpiSub}>{subtext}</div>}
      </div>
    </div>
  );
}
