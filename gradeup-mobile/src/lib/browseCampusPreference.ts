import AsyncStorage from '@react-native-async-storage/async-storage';

/** Stored when user chooses “all campuses” as their browse default. */
export const BROWSE_ALL_CAMPUSES = '__all__';

const key = (userId: string, universityId: string) =>
  `browse_default_campus:v1:${userId}:${universityId}`;

export async function getBrowseCampusPreference(
  userId: string,
  universityId: string
): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key(userId, universityId));
  } catch {
    return null;
  }
}

export async function setBrowseCampusPreference(
  userId: string,
  universityId: string,
  campusIdOrAll: string
): Promise<void> {
  await AsyncStorage.setItem(key(userId, universityId), campusIdOrAll);
}
