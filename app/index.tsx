import { PearChatProvider } from './components/PearChatProvider'
import { MainScreen } from './components/MainScreen'

export default function App() {
  return (
    <PearChatProvider>
      <MainScreen />
    </PearChatProvider>
  )
}
