import { Badge, Card, Group, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';

function RegistrationList({ registrations, classes = [], onEdit }) {
    const entries = Object.entries(registrations).map(([key, registration]) => ({
        key,
        ...registration,
    }));

    const classCounts = entries.reduce((counts, r) => {
        (r.classes || []).forEach(name => {
            counts[name] = (counts[name] || 0) + 1;
        });
        return counts;
    }, {});

    const classesByType = classes.reduce((groups, c) => {
        const type = c.type || 'Other';
        if (!groups[type]) groups[type] = [];
        groups[type].push(c);
        return groups;
    }, {});

    return (
        <Stack pb="md" gap="xl">
            {classes.length > 0 ? (
                <Stack gap="sm">
                    <Title order={2} size="h4">Class Counts</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                        {Object.entries(classesByType).map(([type, group]) => (
                            <Card key={type} withBorder>
                                <Text fw={700} mb="xs">{type}</Text>
                                <Stack gap={6}>
                                    {group.map(c => (
                                        <Group key={c.name} justify="space-between">
                                            <Text>{c.name}</Text>
                                            <Badge color="gray" variant="filled">{classCounts[c.name] || 0}</Badge>
                                        </Group>
                                    ))}
                                </Stack>
                            </Card>
                        ))}
                    </SimpleGrid>
                </Stack>
            ) : null}
            <Stack gap="sm">
                <Title order={2} size="h4">Registered Racers</Title>
                <Text fs="italic" c="dimmed">
                    Click your name below to edit your entry. If you no longer plan to race, please let the
                    office know so your registration can be removed.
                </Text>
                {entries.map(r => (
                    <Card key={r.key} withBorder padding="sm">
                        <Group justify="space-between" align="center" wrap="wrap">
                            <UnstyledButton onClick={() => onEdit(r.key)} fw={600} c="blue">
                                {r.name}
                            </UnstyledButton>
                            <Text size="sm">{r.classes.join(', ')}</Text>
                        </Group>
                    </Card>
                ))}
            </Stack>
        </Stack>
    );
}

export default RegistrationList;
