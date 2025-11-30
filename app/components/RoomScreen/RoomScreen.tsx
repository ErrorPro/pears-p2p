import React, { useCallback, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { usePearChat } from '../PearChatProvider'
import { styles } from './styles'

export function RoomScreen() {
  const { messages, peerCount, inviteUrl, sendMessage, leaveRoom } =
    usePearChat()

  const [input, setInput] = React.useState('')
  const flatListRef = useRef<FlatList>(null)

  const handleSend = useCallback(() => {
    if (input.trim()) {
      sendMessage(input.trim())
      setInput('')
    }
  }, [input, sendMessage])

  const handleCopy = useCallback(() => {
    Clipboard.setString(inviteUrl)
    Alert.alert('Invite Copied!', inviteUrl)
  }, [inviteUrl])

  const formatDate = useCallback((timestamp: number) => {
    try {
      if (!timestamp || isNaN(timestamp) || timestamp <= 0) {
        return 'Invalid date'
      }
      return new Date(timestamp).toLocaleString()
    } catch (e) {
      console.error('Error formatting date:', e)
      return 'Invalid date'
    }
  }, [])

  const getMessageKey = useCallback((item: any, index: number) => {
    // Use timestamp + index for unique key, fallback to index if timestamp is invalid
    if (item.ts && typeof item.ts === 'number' && !isNaN(item.ts)) {
      return `${item.ts}-${index}`
    }
    return `msg-${index}`
  }, [])

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Active • {peerCount} {peerCount === 1 ? 'peer' : 'peers'} online
        </Text>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <TouchableOpacity onPress={handleCopy}>
            <Text style={styles.linkText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={leaveRoom}>
            <Text style={styles.linkText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={getMessageKey}
        style={styles.messages}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.me ? styles.myBubble : styles.theirBubble
            ]}
          >
            <Text style={styles.bubbleText}>{item.text || ''}</Text>
            <Text style={styles.date}>{formatDate(item.ts)}</Text>
          </View>
        )}
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder='Type a message...'
          placeholderTextColor='#666'
          onSubmitEditing={handleSend}
          returnKeyType='send'
          maxLength={10000}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
