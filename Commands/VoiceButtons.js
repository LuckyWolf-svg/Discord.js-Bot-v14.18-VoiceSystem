import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { saveChannelSettings, getChannelSettings, deleteChannelSettings, updateChannelId, getUserByChannelId } from '../database.js';
import { CHANNEL_IDS } from '../server_ids.js';

export const userChannels = {};
const transferRequests = new Map();

export function registerVoiceButton(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        
        if (message.content === '!VoiceSetting') {
            const member = message.member;
            if (!member.voice.channel) {
                await message.channel.send("Вы не находитесь в голосовом канале.");
                return;
            }

            const targetTextChannel = message.guild.channels.cache.get(CHANNEL_IDS.VOICE_CREATE);
            if (!targetTextChannel) {
                await message.channel.send("Не удалось найти канал для настроек.");
                return;
            }

            const buttons = [
                new ButtonBuilder().setCustomId('change_crown').setLabel('👑').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('change_channel_name').setLabel('📝').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('change_user_limit').setLabel('📊').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('lock_unlock').setLabel('🔒').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('hide_show').setLabel('👁️').setStyle(ButtonStyle.Primary),

                new ButtonBuilder().setCustomId('kickVoice').setLabel('🚫').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('banVoice').setLabel('❌').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('UnbanVoice').setLabel('📩').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('mute_unmute').setLabel('🔇').setStyle(ButtonStyle.Primary) 
            ];

            const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
            const row2 = new ActionRowBuilder().addComponents(buttons.slice(5, 9));

            const embed = new EmbedBuilder()
                .setColor(0xFF5CBD)
                .setAuthor({ name: 'Ваши права на планете' })
                .setThumbnail('https://i.imgur.com/a/QWt4jAN.png')
                .addFields(
                    { name: '👑 - Передать управление каналом другому пользователю', value: '' },
                    { name: '📝 - Изменить название голосового канала', value: '' },
                    { name: '📊 - Установить максимальное количество участников', value: '' },
                    { name: '🔒 - Закрыть или открыть доступ к комнате для всех', value: '' },
                    { name: '👁️ - Скрыть или показать комнату в списке каналов', value: '' },

                    { name: '🚫 - Кикнуть пользователя из вашего канала', value: '' },
                    { name: '❌ - Забанить пользователя в вашем канале', value: '' },
                    { name: '📩 - Разбанить пользователя в вашем канале', value: '' },
                    { name: '🔇 - Заглушить или разрешить говорить участнику', value: '' }
                );

            await targetTextChannel.send({
                embeds: [embed],
                components: [row1, row2]
            });
        }
    });

    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton()) return;

        try {
            if (interaction.customId.startsWith('transfer_')) {
                await handleTransferResponse(interaction);
                return;
            }
            const { member, user, guild, customId } = interaction;
            const userId = user.id;
            const userSettings = await getChannelSettings(userId);
            const userChannelId = userSettings?.channel_id || userChannels[userId];
            const userChannel = guild.channels.cache.get(userChannelId);
            
            if (!userChannel || !userChannel.members.has(userId)) {
                await interaction.reply({ 
                    content: 'У вас нет прав для управления этим каналом.', 
                    ephemeral: true 
                });
                return;
            }

            const voiceChannel = member.voice.channel;
            if (!voiceChannel || voiceChannel.id !== userChannelId) {
                await interaction.reply({ 
                    content: 'Вы не находитесь в своем канале.', 
                    ephemeral: true 
                });
                return;
            }

            switch (customId) {
                case 'change_channel_name':
                    await handleChannelNameChange(interaction, userId, voiceChannel);
                    break;

                case 'change_user_limit':
                    await handleUserLimitChange(interaction, userId, voiceChannel);
                    break;

                case 'change_crown':
                    await handleCrownTransfer(interaction, userId, userChannelId);
                    break;

                case 'lock_unlock':
                    await handleLockUnlock(interaction, userId, userChannel);
                    break;

                case 'hide_show':
                    await handleHideShow(interaction, userId, userChannel);
                    break;

                case 'kickVoice':
                    await handleKickUser(interaction, userChannelId);
                    break;

                case 'banVoice':
                    await handleBanUser(interaction, userId, userChannel);
                    break;

                case 'UnbanVoice':
                    await handleUnbanUser(interaction, userId, userChannel);
                    break;

                case 'mute_unmute':
                    await handleMuteUnmute(interaction, userId, userChannel);
                    break;
            }
        } catch (error) {
            console.error('Ошибка в обработчике кнопок:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'Произошла ошибка при обработке запроса.', 
                    ephemeral: true 
                });
            }
        }
    });

    async function handleTransferResponse(interaction) {
        try {
            const userId = interaction.user.id;
            const transferRequest = transferRequests.get(userId);

            if (!transferRequest) {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Запрос на передачу прав не найден или истек.', 
                        ephemeral: true 
                    });
                }
                return;
            }

            const { fromUserId, channelId } = transferRequest;

            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply({ ephemeral: true });
            }

            if (interaction.customId === 'transfer_accept') {
                const userSettings = await getChannelSettings(fromUserId);
                
                if (userSettings) {
                    await saveChannelSettings(interaction.client.guilds.cache.first(), userId, {
                        ...userSettings,
                        channel_id: channelId
                    });
                    
                    await deleteChannelSettings(fromUserId);
                    
                    userChannels[fromUserId] = null;
                    userChannels[userId] = channelId;
                    
                    await interaction.editReply({ 
                        content: '✅ Вы приняли права на управление каналом!' 
                    });
                    
                    try {
                        const oldOwner = await interaction.client.users.fetch(fromUserId);
                        await oldOwner.send(`✅ Пользователь <@${userId}> принял права на управление каналом.`).catch(() => {});
                    } catch (error) {
                        console.error('Ошибка уведомления старого владельца:', error);
                    }
                }
            } else if (interaction.customId === 'transfer_decline') {
                await interaction.editReply({ 
                    content: '❌ Вы отклонили запрос на передачу прав.' 
                });
                
                try {
                    const oldOwner = await interaction.client.users.fetch(fromUserId);
                    await oldOwner.send(`❌ Пользователь <@${userId}> отклонил запрос на передачу прав.`).catch(() => {});
                } catch (error) {
                    console.error('Ошибка уведомления старого владельца:', error);
                }
            }
            transferRequests.delete(userId);

        } catch (error) {
            console.error('Ошибка обработки запроса передачи:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'Произошла ошибка при обработке запроса.', 
                    ephemeral: true 
                });
            } else if (interaction.deferred) {
                await interaction.editReply({ 
                    content: 'Произошла ошибка при обработке запроса.' 
                });
            }
        }
    }
}

async function handleChannelNameChange(interaction, userId, voiceChannel) {
    await interaction.reply({ 
        content: `Введите новое название для канала \`${voiceChannel.name}\` (1-100 символов)`, 
        ephemeral: true 
    });

    const collector = await createMessageCollector(interaction, userId);
    collector.on('collect', async (message) => {
        if (message.content.length < 1 || message.content.length > 100) {
            await interaction.followUp({ 
                content: 'Название должно содержать от 1 до 100 символов.', 
                ephemeral: true 
            });
            return;
        }

        try {
            await voiceChannel.setName(message.content);
            
            const userSettings = await getChannelSettings(userId) || {};
            await saveChannelSettings(interaction.guild, userId, {
                ...userSettings,
                channel_name: message.content
            });
            
            await interaction.followUp({ 
                content: `Название канала изменено на \`${message.content}\``, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Ошибка изменения названия:', error);
            await interaction.followUp({ 
                content: 'Не удалось изменить название канала.', 
                ephemeral: true 
            });
        }
    });
}

async function handleUserLimitChange(interaction, userId, voiceChannel) {
    await interaction.reply({ 
        content: `Введите новый лимит пользователей для канала \`${voiceChannel.name}\` (0-99)`, 
        ephemeral: true 
    });

    const collector = await createMessageCollector(interaction, userId);
    collector.on('collect', async (message) => {
        const newLimit = parseInt(message.content);
        if (isNaN(newLimit) || newLimit < 0 || newLimit > 99) {
            await interaction.followUp({ 
                content: 'Пожалуйста, введите корректное число от 0 до 99.', 
                ephemeral: true 
            });
            return;
        }

        try {
            await voiceChannel.setUserLimit(newLimit);
            
            const userSettings = await getChannelSettings(userId) || {};
            await saveChannelSettings(interaction.guild, userId, {
                ...userSettings,
                user_limit: newLimit
            });
            
            await interaction.followUp({ 
                content: `Лимит пользователей изменен на \`${newLimit}\``, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Ошибка изменения лимита:', error);
            await interaction.followUp({ 
                content: 'Не удалось изменить лимит пользователей.', 
                ephemeral: true 
            });
        }
    });
}

async function handleCrownTransfer(interaction, userId, userChannelId) {
    await interaction.reply({ 
        content: 'Введите ID пользователя, которому хотите передать права', 
        ephemeral: true 
    });

    const collector = await createMessageCollector(interaction, userId);
    collector.on('collect', async (message) => {
        const targetUserId = message.content.trim();
        
        try {
            const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (!targetMember || !targetMember.voice.channel || targetMember.voice.channel.id !== userChannelId) {
                await interaction.followUp({ 
                    content: 'Пользователь не найден или не находится в вашем канале.', 
                    ephemeral: true 
                });
                return;
            }

            transferRequests.set(targetUserId, {
                fromUserId: userId,
                channelId: userChannelId,
                timestamp: Date.now()
            });

            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('transfer_accept')
                        .setLabel('✅ Принять')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('transfer_decline')
                        .setLabel('❌ Отклонить')
                        .setStyle(ButtonStyle.Danger)
                );

            await targetMember.send({
                content: `Пользователь <@${userId}> хочет передать вам права на управление голосовым каналом \`${interaction.guild.channels.cache.get(userChannelId)?.name || 'канал'}\`. Вы согласны?`,
                components: [confirmRow]
            });

            await interaction.followUp({ 
                content: `Запрос на передачу прав отправлен пользователю <@${targetUserId}>.`, 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Ошибка передачи прав:', error);
            await interaction.followUp({ 
                content: 'Не удалось отправить запрос на передачу прав.', 
                ephemeral: true 
            });
        }
    });
}

async function handleKickUser(interaction, userChannelId) {
    await interaction.reply({ 
        content: 'Введите ID пользователя, которого хотите кикнуть с канала', 
        ephemeral: true 
    });

    const collector = await createMessageCollector(interaction, interaction.user.id);
    collector.on('collect', async (message) => {
        const targetUserId = message.content.trim();
        
        try {
            const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (!targetMember || !targetMember.voice.channel || targetMember.voice.channel.id !== userChannelId) {
                await interaction.followUp({ 
                    content: 'Пользователь не найден или не находится в вашем канале.', 
                    ephemeral: true 
                });
                return;
            }

            await targetMember.voice.disconnect();
            await interaction.followUp({ 
                content: `Пользователь <@${targetUserId}> был кикнут с канала.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Ошибка кика пользователя:', error);
            await interaction.followUp({ 
                content: 'Не удалось кикнуть пользователя.', 
                ephemeral: true 
            });
        }
    });
}

async function handleBanUser(interaction, userId, userChannel) {
    await interaction.reply({ 
        content: 'Введите ID пользователя, которому хотите запретить вход в канал', 
        ephemeral: true 
    });

    const collector = await createMessageCollector(interaction, interaction.user.id);
    collector.on('collect', async (message) => {
        const targetUserId = message.content.trim();
        
        try {
            const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (!targetMember) {
                await interaction.followUp({ 
                    content: 'Пользователь не найден на сервере.', 
                    ephemeral: true 
                });
                return;
            }

            await userChannel.permissionOverwrites.edit(targetMember, {
                Connect: false,
            });
            
            const userSettings = await getChannelSettings(userId) || {};
            const bannedUsers = userSettings.banned_users || [];
            if (!bannedUsers.includes(targetUserId)) {
                bannedUsers.push(targetUserId);
                await saveChannelSettings(interaction.guild, userId, {
                    ...userSettings,
                    banned_users: bannedUsers
                });
            }
            
            await interaction.followUp({ 
                content: `Пользователю <@${targetUserId}> запрещен вход в канал.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Ошибка бана пользователя:', error);
            await interaction.followUp({ 
                content: 'Не удалось запретить вход пользователю.', 
                ephemeral: true 
            });
        }
    });
}

async function handleUnbanUser(interaction, userId, userChannel) {
    await interaction.reply({ 
        content: 'Введите ID пользователя, которому хотите разрешить вход в канал', 
        ephemeral: true 
    });

    const collector = await createMessageCollector(interaction, interaction.user.id);
    collector.on('collect', async (message) => {
        const targetUserId = message.content.trim();
        
        try {
            const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (!targetMember) {
                await interaction.followUp({ 
                    content: 'Пользователь не найден на сервере.', 
                    ephemeral: true 
                });
                return;
            }

            await userChannel.permissionOverwrites.edit(targetMember, {
                Connect: true,
            });
            
            const userSettings = await getChannelSettings(userId) || {};
            const bannedUsers = userSettings.banned_users || [];
            const updatedBannedUsers = bannedUsers.filter(id => id !== targetUserId);
            
            await saveChannelSettings(interaction.guild, userId, {
                ...userSettings,
                banned_users: updatedBannedUsers
            });
            
            await interaction.followUp({ 
                content: `Пользователю <@${targetUserId}> разрешен вход в канал.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Ошибка разбана пользователя:', error);
            await interaction.followUp({ 
                content: 'Не удалось разрешить вход пользователю.', 
                ephemeral: true 
            });
        }
    });
}

function createMessageCollector(interaction, userId) {
    const filter = m => m.author.id === userId;
    const collector = interaction.channel.createMessageCollector({ 
        filter, 
        max: 1, 
        time: 15000 
    });

    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            try {
                await interaction.followUp({ 
                    content: 'Время для ввода истекло.', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Ошибка при завершении коллектора:', error);
            }
        }
    });

    return collector;
}

async function handleLockUnlock(interaction, userId, userChannel) {
    try {
        const userSettings = await getChannelSettings(userId) || {};
        const isLocked = userSettings.is_locked || false;
        
        await userChannel.permissionOverwrites.edit(CHANNEL_IDS.ROLES_ST_ID, {
            Connect: isLocked ? true : false,
        });
        
        await saveChannelSettings(interaction.guild, userId, {
            ...userSettings,
            is_locked: !isLocked
        });
        
        await interaction.reply({ 
            content: `✅ Комната ${!isLocked ? 'закрыта' : 'открыта'} для всех участников.`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Ошибка закрытия/открытия комнаты:', error);
        await interaction.reply({ 
            content: '❌ Не удалось изменить статус комнаты.', 
            ephemeral: true 
        });
    }
}

async function handleHideShow(interaction, userId, userChannel) {
    try {
        const userSettings = await getChannelSettings(userId) || {};
        const isHidden = userSettings.is_hidden || false;

        await userChannel.permissionOverwrites.edit(CHANNEL_IDS.ROLES_ST_ID, {
            ViewChannel: isHidden ? true : false,
        });
        
        await saveChannelSettings(interaction.guild, userId, {
            ...userSettings,
            is_hidden: !isHidden
        });
        
        await interaction.reply({ 
            content: `✅ Комната ${!isHidden ? 'скрыта' : 'показана'} в списке каналов.`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Ошибка скрытия/показа комнаты:', error);
        await interaction.reply({ 
            content: '❌ Не удалось изменить видимость комнаты.', 
            ephemeral: true 
        });
    }
}

async function handleMuteUnmute(interaction, userId, userChannel) {
    await interaction.reply({ 
        content: 'Введите ID пользователя, которого хотите заглушить/разглушить', 
        ephemeral: true 
    });

    const collector = await createMessageCollector(interaction, interaction.user.id);
    collector.on('collect', async (message) => {
        const targetUserId = message.content.trim();
        
        try {
            const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
            if (!targetMember) {
                await interaction.followUp({ 
                    content: 'Пользователь не найден на сервере.', 
                    ephemeral: true 
                });
                return;
            }
            
            if (!userChannel.members.has(targetUserId)) {
                await interaction.followUp({ 
                    content: 'Пользователь не находится в вашем канале.', 
                    ephemeral: true 
                });
                return;
            }

            const userSettings = await getChannelSettings(userId) || {};
            const mutedUsers = userSettings.muted_users || [];
            
            let isMuted = mutedUsers.includes(targetUserId);
            
            await userChannel.permissionOverwrites.edit(targetMember, {
                Speak: isMuted ? true : false,
            });
            
            let updatedMutedUsers;
            if (isMuted) {
                updatedMutedUsers = mutedUsers.filter(id => id !== targetUserId);
            } else {
                updatedMutedUsers = [...mutedUsers, targetUserId];
            }
            
            await saveChannelSettings(interaction.guild, userId, {
                ...userSettings,
                muted_users: updatedMutedUsers
            });
            
            await interaction.followUp({ 
                content: `✅ Пользователь <@${targetUserId}> ${isMuted ? 'разглушен' : 'заглушен'} в канале.`, 
                ephemeral: true 
            });
            
        } catch (error) {
            console.error('Ошибка заглушения пользователя:', error);
            await interaction.followUp({ 
                content: '❌ Не удалось изменить права пользователя.', 
                ephemeral: true 
            });
        }
    });
}
