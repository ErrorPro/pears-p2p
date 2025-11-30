import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#ffffff'
  },
  headerText: {
    color: '#3c7f0a',
    fontWeight: '600',
    fontSize: 15
  },
  linkText: {
    color: '#65a91f',
    fontWeight: '700',
    fontSize: 15
  },

  // Messages
  messages: { flex: 1 },

  bubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 20,
    marginVertical: 6
  },

  // sent by me
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#8ddf40'
  },

  // received
  theirBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e2e2e2'
  },

  bubbleText: {
    color: '#222',
    fontSize: 16
  },

  // Input area
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#ffffff'
  },

  textInput: {
    flex: 1,
    backgroundColor: '#f3f3f3',
    color: '#222',
    padding: 14,
    borderRadius: 24,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#d8d8d8',
    fontSize: 16
  },

  sendButton: {
    backgroundColor: '#8ddf40',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24
  },

  sendText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16
  },
  date: {
    fontSize: 10,
    color: '#555',
    marginTop: 4,
    textAlign: 'right'
  }
})
