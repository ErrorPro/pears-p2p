import React from 'react'
import {
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native'
import { usePearChat } from '../PearChatProvider'
import { styles } from './styles'

export function JoinScreen() {
  const { isConnecting, joinRoom } = usePearChat()
  const [roomName, setRoomName] = React.useState('')
  const isButtonDisabled = isConnecting || !roomName.trim()

  const handleJoin = () => {
    if (roomName.trim()) {
      joinRoom(roomName.trim())
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>Pear P2P Chat</Text>

      <Text style={styles.label}>Room name</Text>
      <TextInput
        style={styles.input}
        value={roomName}
        onChangeText={setRoomName}
        placeholder='e.g. secret-party-2025'
        autoCapitalize='none'
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[styles.button, isButtonDisabled && styles.buttonDisabled]}
        onPress={handleJoin}
        disabled={isButtonDisabled}
      >
        {isConnecting ? (
          <ActivityIndicator color='#000' />
        ) : (
          <Text style={styles.buttonText}>Create or Join Room</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  )
}
