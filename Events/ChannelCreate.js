import { Events } from 'discord.js';
import { userChannels } from '../Commands/VoiceButtons.js';
import { CHANNEL_IDS } from '../server_ids.js';

export function registerDeletechannel(client) {
    client.once(Events.ClientReady, async () => {
        try {
            console.log('🧹 Удаляю пустые каналы...');
            
            client.guilds.cache.forEach(guild => {

                const category = guild.channels.cache.get(CHANNEL_IDS.VOICE_CATEGORY);
                if (!category) return;
                
                category.children.cache.forEach(channel => {
                    if (channel.type !== 2 || channel.id === CHANNEL_IDS.VOICE_CREATE) return;
                    
                    if (channel.members.size === 0) {
                        channel.delete().catch(() => {});
                        for (const [userId, channelId] of Object.entries(userChannels)) {
                            if (channelId === channel.id) {
                                delete userChannels[userId];
                                break;
                            }
                        }
                    }
                });
            });
            
            console.log('✅ Очистка завершена');
        } catch (error) {
            console.error('❌ Ошибка очистки:', error);
        }
    });
    
    client.on(Events.VoiceStateUpdate, async (oldState) => {    
        try {
            const channel = oldState.channel;
            if (channel && channel.id !== CHANNEL_IDS.VOICE_CREATE && channel.members.size === 0 && channel.parentId == CHANNEL_IDS.VOICE_CATEGORY) {                
                setTimeout(async () => {
                    try {
                        await channel.delete();                        
                        for (const [userId, channelId] of Object.entries(userChannels)) {
                            if (channelId === channel.id) {
                                delete userChannels[userId];
                                break;
                            }
                        }
                    } catch (error) {
                        console.error('Ошибка при удалении канала:', error);
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('Ошибка в ChannelDelete:', error);
        }
    });
}
