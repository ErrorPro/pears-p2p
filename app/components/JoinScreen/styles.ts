import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    justifyContent: 'center'
  },

  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#3c7f0a',
    textAlign: 'center',
    marginBottom: 50,
    letterSpacing: 1
  },

  label: {
    color: '#487e16',
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '600'
  },

  input: {
    backgroundColor: '#f2f2f2',
    borderColor: '#d0d0d0',
    borderWidth: 1,
    color: '#333',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    fontSize: 16
  },

  invitePreview: {
    color: '#3e8f12',
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 15,
    fontFamily: 'monospace'
  },

  copyButton: {
    padding: 14,
    backgroundColor: '#e7f6db',
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#c6eab3'
  },

  copyButtonText: {
    color: '#3c7f0a',
    fontWeight: '700',
    fontSize: 16
  },

  button: {
    backgroundColor: '#8ddf40',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },

  buttonDisabled: {
    opacity: 0.5
  },

  buttonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5
  }
})
