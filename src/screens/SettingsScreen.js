import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import {
  getChordSettings,
  loadChordSettings,
  setChordSettings,
  setTypographySettings,
  NOMENCLATURE_OPTIONS,
  ACCIDENTALS_OPTIONS,
  THEME_OPTIONS,
  FONT_FAMILY_OPTIONS,
  CHORD_COLOR_OPTIONS,
  VERSE_COLOR_OPTIONS,
  CHORUS_COLOR_OPTIONS,
  CHORUS_STYLE_OPTIONS,
  COMMENT_COLOR_OPTIONS,
  COMMENT_STYLE_OPTIONS,
  TAB_COLOR_OPTIONS,
} from '../services/chordSettingsService';

function OptionGroup({ options, selectedValue, onSelect }) {
  return (
    <View style={styles.optionGroup}>
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.optionRow, selected && styles.optionRowSelected]}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              {option.hint ? <Text style={styles.optionHint}>{option.hint}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PillOptions({ options, selectedValue, onSelect }) {
  return (
    <View style={styles.pillRow}>
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.pill, selected && styles.pillSelected]}
          >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ColorSwatchPicker({ options, selectedValue, onSelect }) {
  return (
    <View style={styles.swatchRow}>
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <TouchableOpacity key={option.value} onPress={() => onSelect(option.value)} style={styles.swatchWrap}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: option.hex },
                selected && styles.swatchSelected,
                option.value === 'white' && styles.swatchBorder,
              ]}
            />
            <Text style={styles.swatchLabel}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FontSizeStepper({ value, min, max, onChange }) {
  return (
    <View style={styles.stepperRow}>
      <TouchableOpacity onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepperBtn}>
        <Text style={styles.stepperBtnText}>-</Text>
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{value}px</Text>
      <TouchableOpacity onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepperBtn}>
        <Text style={styles.stepperBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={() => onChange(!value)}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </TouchableOpacity>
  );
}

function Row({ label, children }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function TypographyCard({ icon, title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{icon} {title}</Text>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const [nomenclature, setNomenclature] = useState(getChordSettings().nomenclature);
  const [accidentals, setAccidentals] = useState(getChordSettings().accidentals);
  const [typography, setTypography] = useState(getChordSettings().typography);

  useEffect(() => {
    (async () => {
      const settings = await loadChordSettings();
      setNomenclature(settings.nomenclature);
      setAccidentals(settings.accidentals);
      setTypography(settings.typography);
    })();
  }, []);

  async function handleSelectNomenclature(value) {
    setNomenclature(value);
    await setChordSettings({ nomenclature: value });
  }

  async function handleSelectAccidentals(value) {
    setAccidentals(value);
    await setChordSettings({ accidentals: value });
  }

  async function updateTypography(patch) {
    const updated = await setTypographySettings(patch);
    setTypography(updated.typography);
  }

  function updateCategory(category, patch) {
    updateTypography({ [category]: patch });
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.icon}>⚙️</Text>
      <Text style={styles.title}>Einstellungen</Text>

      <Text style={styles.sectionTitle}>Ton-Nomenklatur</Text>
      <Text style={styles.sectionHint}>Wie der Ton zwischen A und C benannt wird.</Text>
      <OptionGroup options={NOMENCLATURE_OPTIONS} selectedValue={nomenclature} onSelect={handleSelectNomenclature} />

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Vorzeichen-Darstellung</Text>
      <Text style={styles.sectionHint}>Wie Halbtonschritte in Akkorden und der Tonart-Anzeige geschrieben werden.</Text>
      <OptionGroup options={ACCIDENTALS_OPTIONS} selectedValue={accidentals} onSelect={handleSelectAccidentals} />

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Typografie (Song-Ansicht & Show-Modus)</Text>
      <Text style={styles.sectionHint}>Gilt sofort in Normal- und Show-Modus.</Text>

      <TypographyCard icon="🖥️" title="Hintergrund">
        <PillOptions options={THEME_OPTIONS} selectedValue={typography.theme} onSelect={(v) => updateTypography({ theme: v })} />
      </TypographyCard>

      <TypographyCard icon="🎵" title="Akkorde">
        <Row label="Schriftgröße">
          <FontSizeStepper
            value={typography.chords.fontSize}
            min={12}
            max={32}
            onChange={(v) => updateCategory('chords', { fontSize: v })}
          />
        </Row>
        <Row label="Farbe">
          <ColorSwatchPicker
            options={CHORD_COLOR_OPTIONS}
            selectedValue={typography.chords.color}
            onSelect={(v) => updateCategory('chords', { color: v })}
          />
        </Row>
        <ToggleRow label="Fett" value={typography.chords.bold} onChange={(v) => updateCategory('chords', { bold: v })} />
      </TypographyCard>

      <TypographyCard icon="📖" title="Strophen-Text">
        <Row label="Schriftart">
          <PillOptions
            options={FONT_FAMILY_OPTIONS}
            selectedValue={typography.verse.fontFamily}
            onSelect={(v) => updateCategory('verse', { fontFamily: v })}
          />
        </Row>
        <Row label="Schriftgröße">
          <FontSizeStepper
            value={typography.verse.fontSize}
            min={12}
            max={32}
            onChange={(v) => updateCategory('verse', { fontSize: v })}
          />
        </Row>
        <Row label="Farbe">
          <ColorSwatchPicker
            options={VERSE_COLOR_OPTIONS}
            selectedValue={typography.verse.color}
            onSelect={(v) => updateCategory('verse', { color: v })}
          />
        </Row>
      </TypographyCard>

      <TypographyCard icon="🎤" title="Refrain-Text">
        <Row label="Schriftart">
          <PillOptions
            options={FONT_FAMILY_OPTIONS}
            selectedValue={typography.chorus.fontFamily}
            onSelect={(v) => updateCategory('chorus', { fontFamily: v })}
          />
        </Row>
        <Row label="Schriftgröße">
          <FontSizeStepper
            value={typography.chorus.fontSize}
            min={12}
            max={32}
            onChange={(v) => updateCategory('chorus', { fontSize: v })}
          />
        </Row>
        <Row label="Farbe">
          <ColorSwatchPicker
            options={CHORUS_COLOR_OPTIONS}
            selectedValue={typography.chorus.color}
            onSelect={(v) => updateCategory('chorus', { color: v })}
          />
        </Row>
        <Row label="Optik">
          <PillOptions
            options={CHORUS_STYLE_OPTIONS}
            selectedValue={typography.chorus.style}
            onSelect={(v) => updateCategory('chorus', { style: v })}
          />
        </Row>
      </TypographyCard>

      <TypographyCard icon="💬" title="Kommentare">
        <Row label="Schriftgröße">
          <FontSizeStepper
            value={typography.comments.fontSize}
            min={11}
            max={24}
            onChange={(v) => updateCategory('comments', { fontSize: v })}
          />
        </Row>
        <Row label="Farbe">
          <ColorSwatchPicker
            options={COMMENT_COLOR_OPTIONS}
            selectedValue={typography.comments.color}
            onSelect={(v) => updateCategory('comments', { color: v })}
          />
        </Row>
        <Row label="Optik">
          <PillOptions
            options={COMMENT_STYLE_OPTIONS}
            selectedValue={typography.comments.style}
            onSelect={(v) => updateCategory('comments', { style: v })}
          />
        </Row>
      </TypographyCard>

      <TypographyCard icon="🎸" title="Tabulatur">
        <Text style={styles.sectionHint}>Schriftart ist fest auf Monospace eingestellt (für saubere Saiten-Tabs).</Text>
        <Row label="Schriftgröße">
          <FontSizeStepper
            value={typography.tabs.fontSize}
            min={11}
            max={24}
            onChange={(v) => updateCategory('tabs', { fontSize: v })}
          />
        </Row>
        <Row label="Farbe">
          <ColorSwatchPicker
            options={TAB_COLOR_OPTIONS}
            selectedValue={typography.tabs.color}
            onSelect={(v) => updateCategory('tabs', { color: v })}
          />
        </Row>
      </TypographyCard>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4', padding: 24 },
  icon: { fontSize: 40, marginBottom: 8, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#222', marginBottom: 24, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  sectionHint: { fontSize: 13, color: '#888', marginBottom: 12 },
  optionGroup: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  optionRowSelected: { backgroundColor: '#FFFBEA' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CCC',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: '#FFD700' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFD700' },
  optionLabel: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  optionHint: { fontSize: 12, color: '#888', marginTop: 2 },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#222', marginBottom: 12 },
  row: { marginBottom: 12 },
  rowLabel: { fontSize: 13, color: '#666', fontWeight: '600', marginBottom: 6 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F1F1',
    marginRight: 8,
    marginBottom: 8,
  },
  pillSelected: { backgroundColor: '#FFD700' },
  pillText: { color: '#555', fontSize: 13, fontWeight: '600' },
  pillTextSelected: { color: '#222' },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap' },
  swatchWrap: { alignItems: 'center', marginRight: 16, marginBottom: 8, width: 56 },
  swatch: { width: 32, height: 32, borderRadius: 16, marginBottom: 4 },
  swatchSelected: { borderWidth: 3, borderColor: '#3478F6' },
  swatchBorder: { borderWidth: 1, borderColor: '#DDD' },
  swatchLabel: { fontSize: 11, color: '#666', textAlign: 'center' },

  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 17, fontWeight: 'bold', color: '#222' },
  stepperValue: { marginHorizontal: 14, fontSize: 15, fontWeight: 'bold', color: '#222', minWidth: 44, textAlign: 'center' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  toggleLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DDD',
    padding: 3,
  },
  toggleTrackOn: { backgroundColor: '#FFD700' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
