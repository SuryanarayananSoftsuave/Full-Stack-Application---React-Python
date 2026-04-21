import styles from "../DashboardPage.module.css";

export function ChartCard({ title, subtitle, action, children, className = "" }) {
  return (
    <div className={`${styles.chartCard} ${className}`}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{title}</h3>
          {subtitle && <p className={styles.chartSubtitle}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={styles.chartBody}>{children}</div>
    </div>
  );
}
