// ============================================================
// 📄 utils/safeInteraction.js
// بيحمي من خطأ Unknown interaction لو التفاعل خلص قبل ما نرد عليه
// ============================================================

// utils/safeInteraction.js
/**
 * دالة مساعدة للتعامل الآمن مع التفاعلات
 * تتعامل مع خطأ Unknown interaction بشكل تلقائي
 */
async function safeInteraction(interaction, callback, fallbackMessage = '❌ حدث خطأ، يرجى المحاولة مرة أخرى') {
    if (!interaction || !interaction.isRepliable()) {
        logger.warn('Interaction is not valid to handle');
        return null;
    }

    try {
        // تأجيل الرد إذا لم يتم
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.deferReply({ ephemeral: true });
            } catch (err) {
                if (err.code === 10062) {
                    logger.warn('Ignoring expired interaction while deferring');
                    return null;
                }
                throw err;
            }
        }

        // تنفيذ العملية
        const result = await callback(interaction);

        // التأكد من الرد
        if (!interaction.replied && interaction.isRepliable()) {
            try {
                await interaction.editReply(result || { content: '✅ تم التنفيذ بنجاح', ephemeral: true });
            } catch (err) {
                if (err.code === 10062) {
                    logger.warn('Ignoring expired interaction while replying');
                    return result;
                }
                throw err;
            }
        }

        return result;
    } catch (error) {
        if (error.code === 10062) {
            logger.warn('Ignoring expired interaction in safeInteraction');
            return null;
        }

        logger.error('Error in safeInteraction:', error.message);
        
        try {
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.editReply({
                    content: fallbackMessage,
                    ephemeral: true
                }).catch(() => {});
            }
        } catch (replyError) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send error message:', replyError.message);
            }
        }

        throw error;
    }
}

module.exports = { safeInteraction };