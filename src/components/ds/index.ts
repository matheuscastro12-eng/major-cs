// Design system do app — barrel de re-exports.
//
// Os primitivos visuais nasceram no modo Carreira (CareerShell/CareerDashFrame/
// DashCard + tokens --em-*), e foram promovidos a sistema do app inteiro. Pra
// novos componentes (e quando migrar telas legadas), prefira importar daqui em
// vez de chegar direto no path interno.
export { DashCard } from '../career/DashCard';
export { CareerShell as AppShell, CareerDashFrame as AppFrame } from '../career/CareerShell';
export { appDashClass, useAppTheme } from '../../state/career-theme';
