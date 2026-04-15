import { useAuth } from "../../hooks/useAuth";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      <h1 className={styles.greeting}>Hello, {user?.full_name}</h1>
      <p className={styles.email}>{user?.email}</p>
    </div>
  );
}
