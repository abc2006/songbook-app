import React from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { styles } from '../styles/appStyles';

export function EditSongView({ insetsBottom, editText, onTextChange, onCancel, onSave }) {
  return (
    <>
      <ScrollView style={styles.lyricsContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>
          Song-Text mit Direktiven & Akkorden
        </Text>
        <Text style={styles.helperText}>
          {'{id: ...} {title: ...} {artist: ...} {bpm: ...} {key: ...} {tags: ...} ganz oben, danach die Lyrics mit Akkorden wie [Am]Text. Die id bitte nicht von Hand ändern.'}
        </Text>
        <TextInput
          style={[styles.input, styles.fullEditInput]}
          value={editText}
          onChangeText={onTextChange}
          placeholder={`{id: ...}\n{title: ...}\n{artist: ...}\n{bpm: 120}\n{key: Am}\n{tags: Rock, Live}\n\n[Am]Text der ersten Zeile...`}
          placeholderTextColor="#aaa"
          multiline
          textAlignVertical="top"
        />
        <View style={{ height: 100 }} />
      </ScrollView>
      <View style={[styles.controlBarEdit, { paddingBottom: insetsBottom }]}>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Abbrechen</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Speichern</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
