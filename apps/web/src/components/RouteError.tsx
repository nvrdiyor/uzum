import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Marshrut xatolari uchun chegara.
 *
 * Sahifa yuklanmasa yoki render paytida xato bo'lsa, React butun daraxtni
 * bo'shatadi va foydalanuvchi oq (yoki eski) ekranda qolib ketadi. Bu chegara
 * shunday holatda tushunarli xabar va "Qayta yuklash" tugmasini ko'rsatadi.
 */
interface Props {
  children: ReactNode;
  /**
   * Marshrut kaliti. O'zgarganda xato holati tozalanadi — aks holda bitta
   * sahifadagi xatodan keyin butun sayt shu xabarda qotib qolardi.
   */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class RouteError extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Konsolda to'liq sabab qolsin — diagnostika uchun
    console.error('Sahifani ochib bo‘lmadi:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/[0.12] text-danger-ink">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Sahifani ochib bo‘lmadi</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Sayt yangilangan bo‘lishi mumkin. Sahifani qayta yuklang — odatda shu yetarli.
          </p>
        </div>
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => window.location.reload()}>
          Qayta yuklash
        </button>
        <p className="max-w-lg break-words text-2xs text-muted">{error.message}</p>
      </div>
    );
  }
}
