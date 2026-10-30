import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

export type PickedPhoto = { uri: string; fileName?: string | null; mimeType?: string | null };

const OPTIONS = { mediaTypes: ["images"] as ImagePicker.MediaType[], quality: 0.7 };

async function fromLibrary(limit: number): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    ...OPTIONS,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  return result.canceled ? [] : result.assets;
}

async function fromCamera(): Promise<PickedPhoto[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Appareil photo refusé", "Autorisez l'appareil photo dans les réglages du téléphone.");
    return [];
  }
  const result = await ImagePicker.launchCameraAsync(OPTIONS);
  return result.canceled ? [] : result.assets;
}

/** Demande la source (galerie ou appareil photo) puis renvoie les photos choisies. */
export function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  return new Promise((resolve) => {
    Alert.alert("Ajouter des photos", undefined, [
      { text: "Galerie", onPress: () => void fromLibrary(limit).then(resolve, () => resolve([])) },
      { text: "Appareil photo", onPress: () => void fromCamera().then(resolve, () => resolve([])) },
      { text: "Annuler", style: "cancel", onPress: () => resolve([]) },
    ]);
  });
}
