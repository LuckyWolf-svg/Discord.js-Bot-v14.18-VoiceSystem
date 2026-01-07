import { Events } from 'discord.js';
import { sendLogEmbed } from '../Events/Logs/LogSettings.js';

export function registerMessageClearCommand(client) {
    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;
        
        if (interaction.commandName === 'clear') {
            // Проверяем права пользователя
            if (!interaction.member.permissions.has('ManageMessages')) {
                return await interaction.reply({
                    content: '❌ У вас нет прав для управления сообщениями!',
                    ephemeral: true
                });
            }

            const amount = interaction.options.getInteger('amount');

            try {
                await interaction.deferReply({ ephemeral: true });

                // Получаем сообщения и фильтруем те, которые старше 14 дней
                const messages = await interaction.channel.messages.fetch({ limit: amount });
                const filteredMessages = messages.filter(msg => {
                    return Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000;
                });

                if (filteredMessages.size === 0) {
                    return await interaction.editReply({
                        content: '❌ Не удалось удалить сообщения. Все сообщения старше 14 дней.'
                    });
                }

                // Удаляем сообщения
                await interaction.channel.bulkDelete(filteredMessages, true);

                // Отправляем лог
                await sendLogEmbed(client, 
                    '🗑️ Массовое удаление сообщений',
                    `Было удалено ${filteredMessages.size} сообщений в канале`,
                    '#FF6B6B',
                    [
                        { name: 'Модератор', value: `${interaction.user} (ID: ${interaction.user.id})`, inline: true },
                        { name: 'Канал', value: `${interaction.channel}`, inline: true },
                        { name: 'Запрошено', value: `${amount} сообщений`, inline: true },
                        { name: 'Удалено', value: `${filteredMessages.size} сообщений`, inline: true }
                    ]
                );

                await interaction.editReply({
                    content: `✅ Успешно удалено ${filteredMessages.size} сообщений!`
                });

            } catch (error) {
                console.error('Ошибка при удалении сообщений:', error);
                await interaction.editReply({
                    content: '❌ Произошла ошибка при удалении сообщений!'
                });
            }
        }
    });
}
