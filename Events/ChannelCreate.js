import { Events } from 'discord.js';
import { getChannelSettings, saveChannelSettings } from '../database.js';
import { userChannels } from '../Commands/VoiceButtons.js';
import { CHANNEL_IDS } from '../server_ids.js';

export function registerChannelButton(client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        try {
            if (newState.channelId === CHANNEL_IDS.VOICE_CREATE) {
                if (newState.channelId && oldState.channelId !== newState.channelId) {
                    const guild = newState.guild;
                    const userId = newState.member.user.id;
                    
                    const userSettings = await getChannelSettings(userId);
                    
                    const newChannel = await guild.channels.create({
                        name: userSettings?.channel_name || `${newState.member.user.username}`,
                        parent: CHANNEL_IDS.VOICE_CATEGORY,
                        type: 2,
                        userLimit: userSettings?.user_limit || 0
                    });

                    await applyAllChannelSettings(newChannel, guild, userSettings, userId);
                    
                    await saveChannelSettings(guild, userId, {
                        ...userSettings,
                        channel_id: newChannel.id,
                        channel_name: userSettings?.channel_name || `${newState.member.user.username}`,
                        user_limit: userSettings?.user_limit || 0,
                        banned_users: userSettings?.banned_users || [],
                        muted_users: userSettings?.muted_users || [],
                        is_locked: userSettings?.is_locked || false,
                        is_hidden: userSettings?.is_hidden || false
                    });
                    
                    if (userSettings?.banned_users && userSettings.banned_users.length > 0) {
                        for (const bannedUserId of userSettings.banned_users) {
                            try {
                                const bannedUser = await guild.members.fetch(bannedUserId);
                                await newChannel.permissionOverwrites.create(bannedUser, {
                                    Connect: false
                                });
                            } catch (error) {
                                if (error.code !== 10007) {
                                    console.error(`❌ Ошибка применения бана для ${bannedUserId}:`, error.message);
                                }
                            }
                        }
                    }
                    
                    await newState.member.voice.setChannel(newChannel);
                    userChannels[userId] = newChannel.id;
                }
            }
        } catch (error) {
            console.error('❌ Ошибка в ChannelCreate:', error);
        }
    });
}

async function applyAllChannelSettings(newChannel, guild, userSettings, userId) {
    try {
        if (!userSettings) return;
        
        if (userSettings.is_hidden) {
            await newChannel.permissionOverwrites.edit(guild.roles.everyone, {
                ViewChannel: false
            }).catch(error => {
                console.error(`❌ Ошибка установки видимости для канала ${newChannel.id}:`, error.message);
            });
        }
        
        if (userSettings.is_locked) {
            await newChannel.permissionOverwrites.edit(guild.roles.everyone, {
                Connect: false
            }).catch(error => {
                console.error(`❌ Ошибка установки блокировки для канала ${newChannel.id}:`, error.message);
            });
        }
        
        const mutedUsers = userSettings.muted_users || [];
        for (const mutedUserId of mutedUsers) {
            try {
                const member = await guild.members.fetch(mutedUserId);
                await newChannel.permissionOverwrites.edit(member, {
                    Speak: false
                });
            } catch (error) {
                if (error.code !== 10007) {
                    console.error(`❌ Не удалось восстановить заглушение для ${mutedUserId}:`, error.message);
                }
            }
        }
        
        if (userSettings.banned_users && userSettings.banned_users.length > 0) {
            for (const bannedUserId of userSettings.banned_users) {
                try {
                    const bannedUser = await guild.members.fetch(bannedUserId);
                    await newChannel.permissionOverwrites.edit(bannedUser, {
                        Connect: false
                    });
                } catch (error) {
                    if (error.code !== 10007) {
                        console.error(`❌ Не удалось восстановить бан для ${bannedUserId}:`, error.message);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка применения настроек канала:', error);
    }
}
